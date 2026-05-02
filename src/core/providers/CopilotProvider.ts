import * as vscode from 'vscode';
import { AIProvider, ChatMessage, ChatRequest, ChatResponse, ModelInfo, ToolCall } from './AIProvider';

// Convert our standard format to VS Code Language Model format
function convertToVSCodeMessage(msg: ChatMessage): vscode.LanguageModelChatMessage {
  switch (msg.role) {
    case 'system':
      return vscode.LanguageModelChatMessage.User(msg.content, 'system');
    case 'user':
      return vscode.LanguageModelChatMessage.User(msg.content);
    case 'assistant':
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Convert tool calls to VS Code format
        const toolParts: vscode.LanguageModelToolCallPart[] = msg.toolCalls.map(tc =>
          new vscode.LanguageModelToolCallPart(tc.id, tc.function.name, JSON.parse(tc.function.arguments))
        );
        return vscode.LanguageModelChatMessage.Assistant([
          new vscode.LanguageModelTextPart(msg.content || ''),
          ...toolParts
        ]);
      }
      return vscode.LanguageModelChatMessage.Assistant(msg.content);
    case 'tool':
      return vscode.LanguageModelChatMessage.User(
        new vscode.LanguageModelToolResultPart(msg.toolCallId || '', msg.content)
      );
    default:
      return vscode.LanguageModelChatMessage.User(msg.content);
  }
}

// Convert VS Code message to our standard format
function convertFromVSCodeMessage(msg: vscode.LanguageModelChatMessage): ChatMessage {
  if (msg.role === vscode.LanguageModelChatMessageRole.User) {
    // Check if this is a system message (our convention)
    const parts = Array.isArray(msg.content) ? msg.content : [msg.content];
    const textPart = parts.find(p => p instanceof vscode.LanguageModelTextPart) as vscode.LanguageModelTextPart;
    const text = textPart?.value || parts.find(p => typeof p === 'string') as string || '';

    return {
      role: text.includes('[system]') ? 'system' : 'user',
      content: text.replace('[system]', '').trim()
    };
  } else {
    // Assistant message
    const parts = Array.isArray(msg.content) ? msg.content : [msg.content];
    const textPart = parts.find(p => p instanceof vscode.LanguageModelTextPart) as vscode.LanguageModelTextPart;
    const toolParts = parts.filter(p => p instanceof vscode.LanguageModelToolCallPart) as vscode.LanguageModelToolCallPart[];

    const message: ChatMessage = {
      role: 'assistant',
      content: textPart?.value || ''
    };

    if (toolParts.length > 0) {
      message.toolCalls = toolParts.map(tp => ({
        id: tp.callId,
        type: 'function' as const,
        function: {
          name: tp.name,
          arguments: JSON.stringify(tp.input)
        }
      }));
    }

    return message;
  }
}

// Convert our tools to VS Code format
function convertToVSCodeTool(tool: any): vscode.LanguageModelChatTool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: tool.function.parameters
  };
}

/**
 * Provider implementation for GitHub Copilot via VS Code Language Model API
 */
export class CopilotProvider extends AIProvider {
  readonly name = 'GitHub Copilot';
  readonly vendor = 'copilot';

  async isAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });

      // Map known families to our cost structure
      const costMap: Record<string, number> = {
        'claude-opus-4.6': 3,
        'claude-opus-4.5': 3,
        'claude-sonnet-4.6': 1,
        'claude-sonnet-4.5': 0.5,
        'claude-sonnet-4': 0,
        'claude-haiku-4.5': 0,
        'gpt-5.4': 3,
        'gpt-5.4-mini': 0,
        'gpt-5.3-codex': 1,
        'gpt-5.2-codex': 0.5,
        'gpt-5.2': 0.5,
        'gpt-5.1': 0.25,
        'gpt-5-mini': 0,
        'gpt-4o': 0,
        'gpt-4.1': 0,
        'gemini-3.1-pro': 3,
        'gemini-3-flash': 0,
        'gemini-2.5-pro': 1,
        'grok-code-fast-1': 0,
        'raptor-mini': 0
      };

      return models
        .filter(model => model.vendor === 'copilot')
        .map(model => ({
          id: model.family,
          name: model.name,
          description: `${model.vendor} - ${model.family}`,
          contextLength: model.maxInputTokens,
          costMultiplier: costMap[model.family] || 0,
          capabilities: {
            chat: true,
            tools: true,
            vision: false, // TODO: Check if model supports vision
            code: model.family.includes('codex') || model.family.includes('grok-code')
          }
        }));
    } catch (error) {
      console.error('[CopilotProvider] Failed to get models:', error);
      return [];
    }
  }

  async chat(request: ChatRequest, modelId: string): Promise<ChatResponse> {
    try {
      // Get the model
      const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
      if (!model) {
        throw new Error(`Model ${modelId} not available`);
      }

      // Convert messages
      const messages = request.messages.map(convertToVSCodeMessage);

      // Convert tools if provided
      const tools = request.tools?.map(convertToVSCodeTool) || [];

      // Make the request
      const response = await model.sendRequest(
        messages,
        {
          tools,
          justification: 'Vigil AI agent execution'
        }
      );

      // Convert response
      let content = '';
      const toolCalls: ToolCall[] = [];

      for await (const part of response.text) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input)
            }
          });
        }
      }

      const chatMessage: ChatMessage = {
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 && { toolCalls })
      };

      return {
        message: chatMessage,
        usage: {
          promptTokens: 0, // VS Code API doesn't provide usage info
          completionTokens: 0,
          totalTokens: 0
        }
      };
    } catch (error) {
      console.error('[CopilotProvider] Chat request failed:', error);
      throw new Error(`Copilot chat failed: ${error}`);
    }
  }

  async *chatStream(request: ChatRequest, modelId: string): AsyncGenerator<Partial<ChatResponse>> {
    try {
      // Get the model
      const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
      if (!model) {
        throw new Error(`Model ${modelId} not available`);
      }

      // Convert messages
      const messages = request.messages.map(convertToVSCodeMessage);

      // Convert tools if provided
      const tools = request.tools?.map(convertToVSCodeTool) || [];

      // Make the request
      const response = await model.sendRequest(
        messages,
        {
          tools,
          justification: 'Vigil AI agent execution'
        }
      );

      // Stream response
      let content = '';
      const toolCalls: ToolCall[] = [];

      for await (const part of response.text) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content += part.value;
          yield {
            message: {
              role: 'assistant',
              content
            }
          };
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input)
            }
          });
        }
      }

      // Final message with tool calls if any
      if (toolCalls.length > 0) {
        yield {
          message: {
            role: 'assistant',
            content,
            toolCalls
          }
        };
      }
    } catch (error) {
      console.error('[CopilotProvider] Streaming chat failed:', error);
      throw new Error(`Copilot streaming failed: ${error}`);
    }
  }
}
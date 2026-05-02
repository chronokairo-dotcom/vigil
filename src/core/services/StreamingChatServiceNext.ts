import { Logger } from '../utils/Logger';
import { AIProvider } from '../providers/AIProvider';
import { ChatHistory } from '../entities/ChatHistory';
import { getEventBus } from '../events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Streaming Chat Service for Next.js App Router
 * 
 * Provides real-time streaming of LLM responses using Server-Sent Events (SSE)
 * Adapted from Hono Context to Next.js Response streams
 */

export interface StreamConfig {
  channel: string;
  pipelineId?: string;
  userId: string;
  maxTokens?: number;
  temperature?: number;
}

export interface StreamMessage {
  id: string;
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: string;
  error?: string;
}

export class StreamingChatServiceNext {
  private logger = Logger.getInstance();
  private activeStreams: Map<string, AbortController> = new Map();
  private bus = getEventBus('streaming-chat');

  constructor(private aiProvider: AIProvider) {}

  /**
   * Create stream for Next.js Response
   */
  async createStream(
    messages: ChatHistory[],
    config: StreamConfig
  ): Promise<Response> {
    const streamId = uuidv4();
    const abortController = new AbortController();

    this.activeStreams.set(streamId, abortController);

    this.logger.info('[StreamingChat] Stream created', {
      streamId,
      channel: config.channel,
      messageCount: messages.length,
    });

    // Create a readable stream for SSE
    const self = this;
    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          // Emit start event
          const startMessage: StreamMessage = {
            id: streamId,
            type: 'start',
            timestamp: new Date().toISOString(),
          };

          controller.enqueue(`data: ${JSON.stringify(startMessage)}\n\n`);

          // Convert messages to AI provider format
          const aiMessages = messages.map(m => ({
            role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.message,
          }));

          // Call LLM with streaming
          const response = await self.aiProvider.chatStream(
            {
              messages: aiMessages,
              maxTokens: config.maxTokens,
              temperature: config.temperature,
              stream: true,
            },
            'default' // TODO: Get from config/provider
          );

          // Stream chunks
          let fullContent = '';
          for await (const chunk of response) {
            if (abortController.signal.aborted) {
              break;
            }

            const content = chunk.message?.content || '';
            fullContent += content;

            const chunkMessage: StreamMessage = {
              id: streamId,
              type: 'chunk',
              content,
              timestamp: new Date().toISOString(),
            };

            controller.enqueue(`data: ${JSON.stringify(chunkMessage)}\n\n`);

            // Small delay to allow client cancellation
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Emit end event
          const endMessage: StreamMessage = {
            id: streamId,
            type: 'end',
            timestamp: new Date().toISOString(),
            usage: {
              promptTokens: 0, // TODO: Get from AI provider
              completionTokens: 0,
              totalTokens: 0,
            },
          };

          controller.enqueue(`data: ${JSON.stringify(endMessage)}\n\n`);

          // Emit event to bus
          await self.bus.emit('chat:message:streamed', {
            streamId,
            channel: config.channel,
            pipelineId: config.pipelineId,
            userId: config.userId,
            content: fullContent,
            timestamp: new Date().toISOString(),
          });

          self.logger.info('[StreamingChat] Stream completed', { streamId });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            self.logger.info('[StreamingChat] Stream canceled', { streamId });
          } else {
            self.logger.error('[StreamingChat] Stream error', {
              streamId,
              error,
            });

            const errorMessage: StreamMessage = {
              id: streamId,
              type: 'error',
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            };

            controller.enqueue(`data: ${JSON.stringify(errorMessage)}\n\n`);
          }
        } finally {
          self.activeStreams.delete(streamId);
          controller.close();
        }
      },

      cancel: () => {
        abortController.abort();
        self.activeStreams.delete(streamId);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  }

  /**
   * Cancel active stream
   */
  cancelStream(streamId: string): void {
    const controller = this.activeStreams.get(streamId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(streamId);
      this.logger.debug('[StreamingChat] Stream canceled', { streamId });
    }
  }

  /**
   * Get active streams count
   */
  getActiveStreamsCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Cancel all streams
   */
  cancelAllStreams(): void {
    this.activeStreams.forEach(controller => {
      controller.abort();
    });
    this.activeStreams.clear();
  }
}

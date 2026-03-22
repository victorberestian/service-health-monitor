/**
 * Topic-based message broker for decoupled communication between services.
 * Supports typed payloads and one-to-many message delivery.
 */
export class Broker {
  private listeners: Map<string, Array<(payload?: unknown) => void>> = new Map();

  /**
   * Subscribe to a topic.
   *
   * @param topic - The message topic to listen for
   * @param handler - Callback invoked when a message is published on this topic
   * @returns Unsubscribe function
   */
  on<TPayload = void>(topic: string, handler: (payload: TPayload) => void): () => void {
    this.listeners.set(topic, [handler as (payload?: unknown) => void]);

    return () => {
      const handlers = this.listeners.get(topic) ?? [];
      this.listeners.set(topic, handlers.filter((handlerRef) => handlerRef !== handler));
    };
  }

  /**
   * Publish a message to all subscribers of a topic.
   *
   * @param topic - The message topic
   * @param payload - Optional typed payload
   */
  send<TPayload = void>(topic: string, payload?: TPayload): void {
    const handlers = this.listeners.get(topic) ?? [];
    handlers.forEach((handler) => handler(payload));
  }

  /**
   * Send a message and wait for the first response on a reply topic.
   *
   * @param requestTopic - The topic to send the request on
   * @param replyTopic - The topic to listen for a response on
   * @param payload - Optional request payload
   * @param timeoutMs - Timeout in milliseconds (default 5000)
   * @returns Promise resolving to the reply payload
   */
  request<TRequest = void, TReply = unknown>(
    requestTopic: string,
    replyTopic: string,
    payload?: TRequest,
    timeoutMs: number = 5000
  ): Promise<TReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Broker request timed out after ${timeoutMs}ms on topic: ${replyTopic}`));
      }, timeoutMs);

      const unsubscribe = this.on<TReply>(replyTopic, (reply) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(reply);
      });

      this.send(requestTopic, payload);
    });
  }
}
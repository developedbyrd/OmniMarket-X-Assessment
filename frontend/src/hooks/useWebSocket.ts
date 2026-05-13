import { useEffect, useState } from 'react';
import type { WebSocketMessage } from '../api';

interface UseWebSocketOptions {
  onMessage: (data: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const {
    onMessage,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5
  } = options;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let shouldReconnect = true;

    const connect = () => {
      try {
        socket = new WebSocket(url);

        socket.onopen = () => {
          console.log('WebSocket connected');
          attempts = 0;
          setIsConnected(true);
          setReconnectAttempts(0);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            onMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          onError?.(error);
        };

        socket.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);

          if (shouldReconnect && attempts < maxReconnectAttempts) {
            attempts += 1;
            setReconnectAttempts(attempts);
            reconnectTimeout = setTimeout(() => {
              console.log(`Reconnecting... (attempt ${attempts}/${maxReconnectAttempts})`);
              connect();
            }, reconnectInterval);
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
      }
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [maxReconnectAttempts, onError, onMessage, reconnectInterval, url]);

  return { isConnected, reconnectAttempts };
}

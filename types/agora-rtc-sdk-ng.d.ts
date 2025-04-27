import { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

// 扩展IAgoraRTCClient接口以添加sendStreamMessage方法
declare module 'agora-rtc-sdk-ng' {
  interface IAgoraRTCClient {
    sendStreamMessage(data: Uint8Array | string, reliable: boolean): Promise<void>;
  }
} 
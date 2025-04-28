'use client';

import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser, ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { AkoolService, AkoolSessionCreateResponse } from '@/services/akool';

interface AkoolVideoChatProps {
  apiToken: string;
  avatarId?: string;
}

export default function AkoolVideoChat({ apiToken, avatarId = 'dvp_Tristan_cloth2_1080P' }: AkoolVideoChatProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AkoolSessionCreateResponse | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [responseText, setResponseText] = useState('');
  
  const agoraClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<ILocalAudioTrack | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const akoolServiceRef = useRef<AkoolService | null>(null);
  const messageIdCounterRef = useRef(0);

  // 初始化Akool服务
  useEffect(() => {
    akoolServiceRef.current = new AkoolService(apiToken);
    
    // 组件卸载时清理
    return () => {
      if (session) {
        akoolServiceRef.current?.closeSession(session._id).catch(console.error);
      }
      leaveCall();
    };
  }, [apiToken]);

  // 创建会话并加入通话
  useEffect(() => {
    const initSession = async () => {
      if (!akoolServiceRef.current) return;
      
      try {
        setLoading(true);
        
        // 创建Akool会话
        const sessionData = await akoolServiceRef.current.createSession(avatarId);
        setSession(sessionData);
        
        // 初始化Agora客户端
        await initAgoraClient(sessionData);
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize session:', err);
        setError('初始化会话失败，请刷新页面重试');
        setLoading(false);
      }
    };
    
    initSession();
  }, [avatarId]);

  // 初始化Agora客户端
  const initAgoraClient = async (sessionData: AkoolSessionCreateResponse) => {
    try {
      // 创建Agora客户端
      agoraClient.current = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      });
      
      // 注册用户加入和离开的回调
      agoraClient.current.on('user-published', handleUserPublished);
      agoraClient.current.on('user-unpublished', handleUserUnpublished);
      
      // 注册消息接收回调
      agoraClient.current.on('stream-message', handleStreamMessage);
      
      // 加入频道
      const { agora_app_id, agora_channel, agora_token, agora_uid } = sessionData.credentials;
      
      await agoraClient.current.join(
        agora_app_id,
        agora_channel,
        agora_token,
        agora_uid
      );
      
      // 创建并发布本地音频轨道
      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
      await agoraClient.current.publish([localAudioTrack.current]);
      
      console.log('Joined Agora channel successfully');
    } catch (err) {
      console.error('Error joining Agora channel:', err);
      throw err;
    }
  };

  // 处理远程用户发布流
  const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
    try {
      // 订阅远程用户
      await agoraClient.current?.subscribe(user, mediaType);
      console.log('Subscribed to remote user:', user.uid);
      
      remoteUserRef.current = user;
      
      // 如果是视频流，将视频添加到DOM
      if (mediaType === 'video') {
        // 确保videoRef已挂载
        if (videoRef.current) {
          videoRef.current.innerHTML = '';
          user.videoTrack?.play(videoRef.current);
        }
      }
      
      // 如果是音频流，播放音频
      if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    } catch (err) {
      console.error('Error subscribing to remote user:', err);
    }
  };

  // 处理远程用户取消发布流
  const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => {
    if (remoteUserRef.current?.uid === user.uid) {
      remoteUserRef.current = null;
    }
  };

  // 处理接收到的流消息
  const handleStreamMessage = (uid: number, data: Uint8Array) => {
    try {
      const decoder = new TextDecoder();
      const message = JSON.parse(decoder.decode(data));
      
      if (message.type === 'chat' && message.pld.from === 'bot') {
        setResponseText(message.pld.text);
      }
      
      console.log('Received message:', message);
    } catch (err) {
      console.error('Error parsing stream message:', err);
    }
  };

  // 发送消息给虚拟人
  const sendMessage = async () => {
    if (!agoraClient.current || !message.trim() || isSending) return;
    
    try {
      setIsSending(true);
      
      const messageId = `msg-${Date.now()}`;
      messageIdCounterRef.current += 1;
      
      const chatMessage = {
        v: 2,
        type: 'chat',
        mid: messageId,
        idx: 0,
        fin: true,
        pld: {
          text: message
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(chatMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Message sent successfully');
      
      // 清空输入框
      setMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('发送消息失败，请重试');
    } finally {
      setIsSending(false);
    }
  };

  // 离开通话
  const leaveCall = async () => {
    try {
      // 释放本地音频轨道
      localAudioTrack.current?.close();
      
      // 离开频道
      await agoraClient.current?.leave();
      
      console.log('Left call successfully');
    } catch (err) {
      console.error('Error leaving call:', err);
    }
  };

  // 设置虚拟人参数（如语言、语音等）
  const setAvatarParams = async (params: { 
    vid?: string;
    vurl?: string; 
    lang?: string;
    mode?: number;
    bgurl?: string;
  }) => {
    if (!agoraClient.current) return;
    
    try {
      const commandMessage = {
        v: 2,
        type: 'command',
        mid: `cmd-${Date.now()}`,
        pld: {
          cmd: 'set-params',
          data: params
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(commandMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Set avatar params successfully');
    } catch (err) {
      console.error('Failed to set avatar params:', err);
    }
  };

  // 中断虚拟人回复
  const interruptResponse = async () => {
    if (!agoraClient.current) return;
    
    try {
      const interruptMessage = {
        v: 2,
        type: 'command',
        mid: `cmd-${Date.now()}`,
        pld: {
          cmd: 'interrupt'
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(interruptMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Interrupt command sent successfully');
    } catch (err) {
      console.error('Failed to send interrupt command:', err);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
      <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500 p-4">
            <p>{error}</p>
          </div>
        ) : (
          <div ref={videoRef} className="w-full h-full"></div>
        )}
      </div>
      
      <div className="mt-4 p-4 bg-gray-100 rounded-lg">
        <div className="mb-4 min-h-20 p-3 bg-white rounded border">
          <p>{responseText || '虚拟人将在这里回复...'}</p>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入消息..."
            className="flex-1 p-2 border rounded"
            disabled={loading || !!error || isSending}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !!error || !message.trim() || isSending}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            {isSending ? '发送中...' : '发送'}
          </button>
          <button
            onClick={interruptResponse}
            disabled={loading || !!error}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300"
          >
            中断
          </button>
        </div>
        
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setAvatarParams({ lang: 'zh' })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            中文
          </button>
          <button
            onClick={() => setAvatarParams({ lang: 'en' })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            英文
          </button>
          <button
            onClick={() => setAvatarParams({ mode: 1 })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            复述模式
          </button>
          <button
            onClick={() => setAvatarParams({ mode: 2 })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            对话模式
          </button>
        </div>
      </div>
    </div>
  );
} 
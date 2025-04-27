import axios from 'axios';

const AKOOL_API_BASE_URL = 'https://openapi.akool.com/api/open';

export interface AkoolSessionCreateResponse {
  _id: string;
  status: number;
  stream_type: string;
  credentials: {
    agora_uid: number;
    agora_app_id: string;
    agora_channel: string;
    agora_token: string;
  }
}

export interface AkoolAvatarListResponse {
  count: number;
  result: Array<{
    _id: string;
    uid: number;
    type: number;
    from: number;
    avatar_id: string;
    voice_id: string;
    name: string;
    url: string;
    thumbnailUrl: string;
    gender: string;
    available: boolean;
  }>;
}

export class AkoolService {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  // 获取虚拟人列表
  async getAvatarList(page = 1, size = 100): Promise<AkoolAvatarListResponse> {
    try {
      const response = await axios.get(
        `${AKOOL_API_BASE_URL}/v4/liveAvatar/avatar/list?page=${page}&size=${size}`,
        { headers: this.getHeaders() }
      );
      
      if (response.data.code === 1000) {
        return response.data.data;
      } else {
        throw new Error(`Failed to get avatar list: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error fetching avatar list:', error);
      throw error;
    }
  }

  // 创建会话
  async createSession(avatar_id: string, duration = 3600): Promise<AkoolSessionCreateResponse> {
    try {
      const response = await axios.post(
        `${AKOOL_API_BASE_URL}/v4/liveAvatar/session/create`,
        { avatar_id, duration },
        { headers: this.getHeaders() }
      );
      
      if (response.data.code === 1000) {
        return response.data.data;
      } else {
        throw new Error(`Failed to create session: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  // 获取会话详情
  async getSessionDetail(id: string): Promise<AkoolSessionCreateResponse> {
    try {
      const response = await axios.get(
        `${AKOOL_API_BASE_URL}/v4/liveAvatar/session/detail?id=${id}`,
        { headers: this.getHeaders() }
      );
      
      if (response.data.code === 1000) {
        return response.data.data;
      } else {
        throw new Error(`Failed to get session detail: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error fetching session detail:', error);
      throw error;
    }
  }

  // 关闭会话
  async closeSession(id: string): Promise<void> {
    try {
      const response = await axios.post(
        `${AKOOL_API_BASE_URL}/v4/liveAvatar/session/close`,
        { id },
        { headers: this.getHeaders() }
      );
      
      if (response.data.code !== 1000) {
        throw new Error(`Failed to close session: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error closing session:', error);
      throw error;
    }
  }
} 
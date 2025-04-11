import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge'; // 使用Edge运行时获得更好的性能

export async function POST(req: NextRequest) {
  try {
    const { text, voice = 'alloy', format = 'mp3', outputType = 'binary' } = await req.json();
    
    // 验证输入
    if (!text || text.trim() === '') {
      return NextResponse.json(
        { error: '文本内容不能为空' },
        { status: 400 }
      );
    }
    
    // 使用环境变量中的API密钥
    const apiKeyToUse = process.env.OPENAI_API_KEY;
    
    if (!apiKeyToUse) {
      return NextResponse.json(
        { error: '未提供OpenAI API密钥' },
        { status: 400 }
      );
    }
    
    // 确定响应格式
    const responseFormat = format === 'wav' ? 'wav' : 'mp3';
    
    console.log(`调用OpenAI TTS API，使用声音: ${voice}, 格式: ${responseFormat}, 输出类型: ${outputType}, 文本长度: ${text.length}个字符`);
    
    // 创建OpenAI客户端实例
    const openai = new OpenAI({
      apiKey: apiKeyToUse,
    });
    
    // 调用OpenAI TTS API
    const audioResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
      response_format: responseFormat, // 指定响应格式为mp3或wav
    });
    
    // 获取音频数据
    const buffer = await audioResponse.arrayBuffer();
    
    // 添加额外调试日志
    console.log(`OpenAI TTS API响应成功，音频大小: ${buffer.byteLength} 字节, 格式: ${responseFormat}`);
    
    // 如果要求base64输出，则返回JSON包含data URL
    if (outputType === 'base64') {
      // 转换为Base64
      const base64Audio = Buffer.from(buffer).toString('base64');
      
      // 创建Data URL
      const contentType = responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const dataUrl = `data:${contentType};base64,${base64Audio}`;
      
      return NextResponse.json({
        success: true,
        dataUrl,
        format: responseFormat,
        size: buffer.byteLength
      });
    }
    
    // 默认返回二进制音频流
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
  } catch (error: any) {
    console.error('OpenAI TTS API错误:', error.message || error);
    
    // 添加更详细的错误信息
    let errorMessage = '调用OpenAI TTS API时出错';
    let statusCode = 500;
    
    if (error.status === 401) {
      errorMessage = 'OpenAI API密钥无效或已过期';
      statusCode = 401;
    } else if (error.status === 429) {
      errorMessage = 'OpenAI API请求超过速率限制，请稍后再试';
      statusCode = 429;
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      errorMessage = '连接OpenAI API超时，请检查网络连接';
      statusCode = 503;
    }
    
    return NextResponse.json(
      { error: errorMessage, details: error.message || '未知错误' },
      { status: statusCode }
    );
  }
} 
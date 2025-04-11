import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge'; // 使用Edge运行时获得更好的性能

export async function POST(req: NextRequest) {
  console.log("接收到语音识别请求");
  
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as File | null;
    const language = formData.get('language') as string || 'zh';
    
    // 确保语言代码是ISO-639-1格式，去除区域代码
    const langCode = language.split('-')[0].toLowerCase();
    
    console.log(`原始语言参数: ${language}, 转换后: ${langCode}`);
    
    // 验证输入
    if (!audioFile) {
      console.log("未提供音频文件");
      return NextResponse.json(
        { error: '未提供音频文件' },
        { status: 400 }
      );
    }
    
    // 使用环境变量中的API密钥
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.log("服务器未配置OpenAI API密钥");
      return NextResponse.json(
        { error: '服务器未配置OpenAI API密钥' },
        { status: 500 }
      );
    }
    
    // 检查文件大小，Whisper API 有25MB限制
    if (audioFile.size > 25 * 1024 * 1024) {
      console.log("音频文件过大");
      return NextResponse.json(
        { error: '音频文件过大，超过25MB限制' },
        { status: 400 }
      );
    }
    
    if (audioFile.size < 100) {
      console.log("音频文件太小");
      return NextResponse.json(
        { error: '音频文件太小，无法处理' },
        { status: 400 }
      );
    }
    
    console.log(`处理语音识别请求: 文件大小=${audioFile.size}字节, 类型=${audioFile.type || 'unknown'}, 语言=${language}`);
    
    try {
      // 获取音频数据
      const arrayBuffer = await audioFile.arrayBuffer();
      console.log(`读取到音频数据: ${arrayBuffer.byteLength}字节`);
      
      // 确保使用正确的MIME类型
      const fileType = audioFile.type || 'audio/webm';
      
      // 创建OpenAI客户端实例
      const openai = new OpenAI({
        apiKey,
      });

      // 手动设置文件名
      const fileName = "recording.webm";
      console.log(`准备调用OpenAI API，文件类型=${fileType}, 文件名=${fileName}`);
      
      // 使用直接的fetch调用避免OpenAI Node.js SDK的类型转换问题
      const formDataForApi = new FormData();
      formDataForApi.append('file', new Blob([arrayBuffer], { type: fileType }), fileName);
      formDataForApi.append('model', 'whisper-1');
      formDataForApi.append('language', langCode);
      
      const apiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formDataForApi
      });
      
      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`OpenAI API错误: ${apiResponse.status} ${apiResponse.statusText}`, errorText);
        return NextResponse.json(
          { error: `OpenAI API错误 ${apiResponse.status}` },
          { status: apiResponse.status }
        );
      }
      
      const data = await apiResponse.json();
      console.log(`语音识别结果: "${data.text}"`);
      
      // 返回识别结果
      return NextResponse.json({
        text: data.text,
        language
      });
    } catch (apiError: any) {
      console.error('OpenAI API调用失败:', apiError);
      
      // 更详细的API错误信息
      let errorMessage = '调用Whisper API失败';
      let statusCode = 500;
      
      if (apiError.status === 400) {
        errorMessage = '无效的请求参数或音频格式不支持';
        statusCode = 400;
      } else if (apiError.status === 401) {
        errorMessage = 'OpenAI API密钥无效';
        statusCode = 401;
      } else if (apiError.status === 429) {
        errorMessage = 'API请求超过速率限制，请稍后再试';
        statusCode = 429;
      }
      
      return NextResponse.json(
        { error: errorMessage, details: apiError.message || '未知错误' },
        { status: statusCode }
      );
    }
  } catch (error: any) {
    console.error('语音识别处理失败:', error);
    
    // 添加更详细的错误信息
    let errorMessage = '语音识别处理失败';
    let statusCode = 500;
    
    if (error.name === 'TypeError' && error.message.includes('formData')) {
      errorMessage = '无法处理表单数据';
      statusCode = 400;
    }
    
    return NextResponse.json(
      { error: errorMessage, details: error.message || '未知错误' },
      { status: statusCode }
    );
  }
} 
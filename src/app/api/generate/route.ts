import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const response = await fetch('http://221.224.253.54:60085/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // 如果请求流式输出
    if (body.stream) {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      // 创建一个新的 ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream);
    }

    // 非流式输出
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://221.224.253.54:60085/api/tags', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch models from Ollama');
    }

    const data = await response.json();
    
    // 转换 Ollama 的响应格式为我们需要的格式
    const models = data.models.map((model: any) => ({
      name: model.name,
      modified_at: model.modified_at,
      size: model.size
    }));

    return NextResponse.json({ models });
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
} 
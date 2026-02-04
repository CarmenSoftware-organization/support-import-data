import { NextRequest, NextResponse } from 'next/server';
import { getMultiConfig, saveMultiConfig } from '@/lib/config';

// POST - Set a connection as default
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId } = body;

    if (!connectionId || typeof connectionId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid connectionId' },
        { status: 400 }
      );
    }

    const multiConfig = getMultiConfig();
    if (!multiConfig) {
      return NextResponse.json(
        { error: 'No configuration found' },
        { status: 404 }
      );
    }

    if (!multiConfig.connections[connectionId]) {
      return NextResponse.json(
        { error: `Connection "${connectionId}" not found` },
        { status: 404 }
      );
    }

    multiConfig.default = connectionId;
    saveMultiConfig(multiConfig);

    return NextResponse.json({
      success: true,
      message: 'Default connection updated',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

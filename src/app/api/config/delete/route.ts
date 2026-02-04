import { NextRequest, NextResponse } from 'next/server';
import { deleteConnection } from '@/lib/config';
import { resetPool } from '@/lib/db';

// DELETE - Remove a specific connection
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Missing connectionId parameter' },
        { status: 400 }
      );
    }

    deleteConnection(connectionId);
    await resetPool(connectionId);

    return NextResponse.json({
      success: true,
      message: 'Connection removed',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

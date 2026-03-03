import { NextResponse } from 'next/server';
import { getMultiConfig, getCertStatus } from '@/lib/config';

// GET - List all connections
export async function GET() {
  try {
    const multiConfig = getMultiConfig();

    if (!multiConfig) {
      return NextResponse.json({
        connections: {},
        default: '',
      });
    }

    // Return all connections without passwords, include cert status
    const sanitizedConnections: Record<string, unknown> = {};
    for (const [id, config] of Object.entries(multiConfig.connections)) {
      const certStatus = getCertStatus(id);
      sanitizedConnections[id] = {
        ...config,
        password: '********',
        hasCaCert: certStatus.hasCaCert,
        hasClientCert: certStatus.hasClientCert,
        hasClientKey: certStatus.hasClientKey,
      };
    }

    return NextResponse.json({
      connections: sanitizedConnections,
      default: multiConfig.default,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

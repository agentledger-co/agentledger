import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #08080a 0%, #0a0e1a 50%, #08080a 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            display: 'flex',
          }}
        />
        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
              <path d="M24 10L36 16V26C36 32 30 37 24 39C18 37 12 32 12 26V16L24 10Z" stroke="white" strokeOpacity="0.15" strokeWidth="1" fill="none"/>
              <path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span
            style={{
              fontSize: '48px',
              fontWeight: '700',
              color: 'white',
              letterSpacing: '-1px',
            }}
          >
            AgentLedger
          </span>
        </div>
        {/* Tagline */}
        <p
          style={{
            fontSize: '28px',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: '1.4',
            margin: '0',
          }}
        >
          Monitor & control your AI agents.
          Track actions, costs, and safety in real time.
        </p>
        {/* Pills */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          {['Open Source', 'Real-Time Dashboard', 'Budget Controls', 'Kill Switch'].map((pill) => (
            <div
              key={pill}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1px solid rgba(59,130,246,0.2)',
                background: 'rgba(59,130,246,0.05)',
                color: 'rgba(59,130,246,0.7)',
                fontSize: '16px',
                fontWeight: '500',
                display: 'flex',
              }}
            >
              {pill}
            </div>
          ))}
        </div>
        {/* URL */}
        <p
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: 'rgba(255,255,255,0.15)',
          }}
        >
          agentledger.co
        </p>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

'use client';
import * as React from 'react';
import Link from 'next/link';
import { Card, Title3, Body1 } from '@fluentui/react-components';
import { Gift, HandHeart, Sparkles } from 'lucide-react';

interface Stats {
  total: number;
  used: number;
  available: number;
  approved: number;
}

export default function Home() {
  const [stats, setStats] = React.useState<Stats | null>(null);

  React.useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<Stats & { ok: boolean }>)
      .then((d) => {
        if (d.ok) setStats(d);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="page">
      <div className="hero">
        <h1>linux.do 邀请互助站</h1>
        <p>贡献一条邀请，帮助一位想加入的同好。</p>
      </div>

      <div className="stats-bar">
        <div className="stats-cell">
          <span className="stats-num">{stats?.available ?? '—'}</span>
          <span className="stats-label">剩余邀请</span>
        </div>
        <div className="stats-cell">
          <span className="stats-num">{stats?.used ?? '—'}</span>
          <span className="stats-label">已发放</span>
        </div>
        <div className="stats-cell">
          <span className="stats-num">{stats?.approved ?? '—'}</span>
          <span className="stats-label">通过申请</span>
        </div>
      </div>

      <div className="cards">
        <Link href="/contribute" className="card-link">
          <Card>
            <div className="card-inner">
              <Gift className="card-icon" color="#5b8def" strokeWidth={1.5} />
              <Title3>贡献邀请</Title3>
              <Body1>
                贡献一条 <code>linux.do/invites/&lt;token&gt;</code>{' '}
                的邀请链接给等待中的同好。
              </Body1>
            </div>
          </Card>
        </Link>

        <Link href="/request" className="card-link">
          <Card>
            <div className="card-inner">
              <HandHeart className="card-icon" color="#e07b00" strokeWidth={1.5} />
              <Title3>申请邀请</Title3>
              <Body1>
                写下 ≥50 字的具体申请理由，AI 通过后立即获得一条可用邀请。
              </Body1>
            </div>
          </Card>
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 32, textAlign: 'center' }}>
        <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        本站使用 Cloudflare Workers AI（qwen 模型）评审申请理由。
      </p>
    </main>
  );
}

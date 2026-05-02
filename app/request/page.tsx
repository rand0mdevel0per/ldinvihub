'use client';
import * as React from 'react';
import Link from 'next/link';
import {
  Button,
  Field,
  Textarea,
  Title2,
  Body1,
  Spinner,
  Badge,
} from '@fluentui/react-components';
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, Send, ExternalLink } from 'lucide-react';
import { useRecaptcha } from '@/lib/useRecaptcha';

interface RequestResult {
  ok: boolean;
  passed?: boolean;
  score?: number;
  threshold?: number;
  reason?: string;
  violations?: string[];
  url?: string;
  message?: string;
  error?: string;
}

interface StatsResp {
  siteKey?: string | null;
  recaptchaSiteKey?: string | null;
}

export default function RequestPage() {
  const [text, setText] = React.useState('');
  const [token, setToken] = React.useState<string | null>(null);
  const [siteKey, setSiteKey] = React.useState<string | null>(null);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<RequestResult | null>(null);

  const { execute: executeRecaptcha } = useRecaptcha(recaptchaSiteKey);

  React.useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<StatsResp>)
      .then((d) => {
        setSiteKey(d.siteKey ?? null);
        setRecaptchaSiteKey(d.recaptchaSiteKey ?? null);
      })
      .catch(() => {});
  }, []);

  const charCount = text.trim().length;
  const charValid = charCount >= 50 && charCount <= 2000;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const recaptchaToken = await executeRecaptcha('request');
      const resp = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, turnstileToken: token, recaptchaToken }),
      });
      const data = (await resp.json()) as RequestResult;
      setResult(data);
      if (data.ok && data.url) {
        setTimeout(() => {
          window.location.href = data.url!;
        }, 800);
      }
    } catch {
      setResult({ ok: false, error: '网络错误，请重试。' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = charValid && !loading && (!siteKey || !!token);

  return (
    <main className="page">
      <div className="nav">
        <Link href="/">
          <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> 返回首页
        </Link>
      </div>

      <Title2>申请 linux.do 邀请</Title2>
      <Body1 style={{ display: 'block', margin: '8px 0 24px', opacity: 0.8 }}>
        请写下 <strong>≥50 字</strong> 的具体申请理由。理由会由 AI 按本站规则审查，
        通过后立即获得一条可用邀请链接。请注意：邀请链接<strong>一次性失效</strong>，
        请在跳转后立即完成注册。
      </Body1>

      <form className="form-wrap" onSubmit={onSubmit}>
        <Field label="申请理由" required>
          <Textarea
            value={text}
            onChange={(_, d) => setText(d.value)}
            placeholder="例：我长期在 X 领域写技术博客，希望加入 linux.do 与同好讨论 …… 具体说说你想看哪类话题、想分享什么、为什么需要这个社区。"
            rows={8}
            disabled={loading}
            resize="vertical"
          />
        </Field>

        <div className={`char-counter ${charValid ? '' : 'invalid'}`}>
          {charCount} / 50 字（最多 2000）
        </div>

        {siteKey && (
          <Turnstile
            siteKey={siteKey}
            onSuccess={setToken}
            onExpire={() => setToken(null)}
            onError={() => setToken(null)}
          />
        )}

        <Button
          type="submit"
          appearance="primary"
          disabled={!canSubmit}
          icon={loading ? <Spinner size="tiny" /> : <Send size={16} />}
        >
          {loading ? '审查中（约 3-10 秒）…' : '提交申请'}
        </Button>

        {result && (
          <div className={`result-box ${result.ok ? 'success' : 'error'}`}>
            {typeof result.score === 'number' && (
              <div style={{ marginBottom: 8 }}>
                <Badge appearance="filled" color={result.passed ? 'success' : 'danger'}>
                  AI 评分 {result.score} / 100
                </Badge>
                {result.threshold !== undefined && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    （阈值 {result.threshold}）
                  </span>
                )}
              </div>
            )}

            {result.reason && (
              <div style={{ marginBottom: 8 }}>
                <strong>评审理由：</strong>
                {result.reason}
              </div>
            )}

            {result.violations && result.violations.length > 0 && (
              <div>
                <strong>违反条款：</strong>
                <ul className="violations">
                  {result.violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.ok && result.url && (
              <div style={{ marginTop: 12 }}>
                <strong>{result.message}</strong>
                <div style={{ marginTop: 8 }}>
                  <a href={result.url} rel="noopener noreferrer">
                    立即前往邀请链接 <ExternalLink size={14} style={{ verticalAlign: 'middle' }} />
                  </a>
                </div>
                <p className="muted">页面将在 1 秒后自动跳转…</p>
              </div>
            )}

            {!result.ok && !result.violations && (
              <div>{result.error}</div>
            )}
          </div>
        )}
      </form>
    </main>
  );
}

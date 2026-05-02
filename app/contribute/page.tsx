'use client';
import * as React from 'react';
import Link from 'next/link';
import {
  Button,
  Field,
  Input,
  Title2,
  Body1,
  Spinner,
} from '@fluentui/react-components';
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, Send } from 'lucide-react';
import { useRecaptcha } from '@/lib/useRecaptcha';

interface SubmitResult {
  ok: boolean;
  message?: string;
  error?: string;
}

interface StatsResp {
  siteKey?: string | null;
  recaptchaSiteKey?: string | null;
}

export default function ContributePage() {
  const [url, setUrl] = React.useState('');
  const [token, setToken] = React.useState<string | null>(null);
  const [siteKey, setSiteKey] = React.useState<string | null>(null);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<SubmitResult | null>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const recaptchaToken = await executeRecaptcha('contribute');
      const resp = await fetch('/api/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, turnstileToken: token, recaptchaToken }),
      });
      const data = (await resp.json()) as SubmitResult;
      setResult(data);
      if (data.ok) setUrl('');
    } catch {
      setResult({ ok: false, error: '网络错误，请重试。' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = url.trim().length > 0 && !loading && (!siteKey || !!token);

  return (
    <main className="page">
      <div className="nav">
        <Link href="/">
          <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> 返回首页
        </Link>
      </div>

      <Title2>贡献邀请链接</Title2>
      <Body1 style={{ display: 'block', margin: '8px 0 24px', opacity: 0.8 }}>
        请贡献形如 <code>https://linux.do/invites/&lt;token&gt;</code> 的标准 Discourse
        邀请链接。同一链接只能提交一次。
      </Body1>

      <form className="form-wrap" onSubmit={onSubmit}>
        <Field label="邀请链接" required>
          <Input
            value={url}
            onChange={(_, d) => setUrl(d.value)}
            placeholder="https://linux.do/invites/xxxxxxxxxxxxxxxx"
            disabled={loading}
          />
        </Field>

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
          {loading ? '提交中…' : '提交贡献'}
        </Button>

        {result && (
          <div className={`result-box ${result.ok ? 'success' : 'error'}`}>
            {result.ok ? result.message : result.error}
          </div>
        )}
      </form>
    </main>
  );
}

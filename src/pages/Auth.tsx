import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setSent(true);
        toast.success('Magic link sent! Check your email.');
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success('Check your email to confirm your account.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — dark brand */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10"
        style={{ background: 'hsl(224 28% 10%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(252 82% 65% / 0.18)' }}
          >
            <Pill className="w-5 h-5" style={{ color: 'hsl(252 82% 70%)' }} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-white leading-none">Pharmacy Scout</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'hsl(220 18% 45%)' }}>AU Data Platform</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Scrape. Enrich.<br />Export.
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(220 18% 55%)' }}>
            Discover product data across Australian pharmacy and vitamin stores. Build enriched Shopify-ready exports in minutes.
          </p>

          <div className="space-y-2 pt-2">
            {[
              'Real-time scraping progress',
              'Mandatory product-page enrichment',
              'Three-tier export quality system',
              'Price, image & description validation',
            ].map(item => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(252 82% 65% / 0.2)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'hsl(252 82% 70%)' }} />
                </div>
                <span className="text-[12px]" style={{ color: 'hsl(220 18% 60%)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px]" style={{ color: 'hsl(220 18% 35%)' }}>
          © 2025 AU Pharmacy Scout. All rights reserved.
        </p>
      </div>

      {/* Right panel — light auth form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'hsl(252 82% 60% / 0.12)' }}
            >
              <Pill className="w-5 h-5 text-primary" />
            </div>
            <p className="text-[15px] font-bold text-foreground">Pharmacy Scout</p>
          </div>

          <div>
            <h1 className="text-xl font-bold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account to continue</p>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4">
            {sent ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold">Check your inbox</p>
                <p className="text-xs text-muted-foreground">We sent a magic link to <span className="font-medium text-foreground">{email}</span></p>
                <Button variant="ghost" size="sm" onClick={() => setSent(false)}>← Back</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Mode tabs */}
                <div className="flex rounded-xl border border-border overflow-hidden bg-muted p-0.5 gap-0.5">
                  {(['signin', 'signup', 'magic'] as const).map(m => (
                    <button
                      key={m} type="button" onClick={() => setMode(m)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        mode === m
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m === 'magic' ? 'Magic Link' : m === 'signin' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Email address</Label>
                  <Input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required className="h-9 text-sm"
                  />
                </div>

                {mode !== 'magic' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Password</Label>
                    <Input
                      type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required className="h-9 text-sm"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  disabled={loading}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  {mode === 'magic' ? 'Send Magic Link' : mode === 'signup' ? 'Create Account' : 'Sign In'}
                </Button>
              </form>
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Your data is private and secured by Lovable Cloud
          </p>
        </div>
      </div>
    </div>
  );
}

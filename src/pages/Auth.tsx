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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto shadow-glow">
            <Pill className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">AU Pharmacy Scout</h1>
          <p className="text-sm text-muted-foreground">Shopify price intelligence dashboard</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-card space-y-4">
          {sent ? (
            <div className="text-center space-y-3 py-2">
              <Mail className="w-10 h-10 text-primary mx-auto" />
              <p className="text-sm font-medium">Check your inbox</p>
              <p className="text-xs text-muted-foreground">We sent a magic link to {email}</p>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>Back</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex rounded-md border border-border overflow-hidden text-xs mb-4">
                {(['signin', 'signup', 'magic'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex-1 py-1.5 font-medium transition-colors ${mode === m ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                    {m === 'magic' ? 'Magic Link' : m === 'signin' ? 'Sign In' : 'Sign Up'}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="text-sm h-9" />
              </div>
              {mode !== 'magic' && (
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="text-sm h-9" />
                </div>
              )}
              <Button type="submit" className="w-full" size="sm" disabled={loading}>
                {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {mode === 'magic' ? 'Send Magic Link' : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

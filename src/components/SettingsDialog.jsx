import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle2, ArrowUpCircle, LogOut, Loader2,
  AlertTriangle, Github, MessageSquare, ShieldCheck, ExternalLink, Check
} from 'lucide-react';
import { RELEASES_URL, GITHUB_URL, FEEDBACK_URL, PRIVACY_URL } from '@/lib/links';

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const SettingsDialog = () => {
  const {
    isSettingsOpen,
    settingsTab,
    openSettings,
    closeSettings,
    appVersion,
    hasNewVersion,
    isAuthenticated,
    authExpired,
    loginYoutube,
    logoutYoutube,
    refreshAuth,
  } = useAppContext();

  const { preference, setPreference } = useTheme();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await loginYoutube();
    setIsLoggingIn(false);
  };

  return (
    <AlertDialog open={isSettingsOpen} onOpenChange={(open) => { 
      if (open) {
        refreshAuth();
      } else {
        closeSettings();
      }
    }}>
      <AlertDialogContent className="sm:max-w-md bg-background border border-border/30 shadow-2xl p-0 overflow-hidden outline-none rounded-xl gap-0 flex flex-col h-[510px]">
        
        {/* Radix requires a title for screen readers; the visible header is the
            tab row, so this names the dialog without changing the layout. */}
        <AlertDialogTitle className="sr-only">Settings</AlertDialogTitle>

        {/* Header Tabs */}
        <div className="flex items-center px-4 pt-4 pb-0 border-b border-border/30 shrink-0">
          <button
            onClick={() => openSettings('general')}
            className={`px-4 py-2 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              settingsTab === 'general'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60'
            }`}
          >
            General
          </button>
          <button
            onClick={() => openSettings('account')}
            className={`px-4 py-2 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              settingsTab === 'account'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60'
            }`}
          >
            Account
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {settingsTab === 'general' ? (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Appearance */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Appearance</h3>
                <div className="flex items-center justify-between rounded-xl px-4 py-3.5 border border-border/40 bg-secondary/25">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-4">
                    <span className="text-sm font-medium text-foreground">Theme</span>
                    <span className="text-xs text-muted-foreground">Select your preferred appearance</span>
                  </div>
                  
                  {/* Segmented Control */}
                  <div className="flex items-center bg-background/50 border border-border/40 rounded-lg p-0.5 shrink-0">
                    <button
                      onClick={() => setPreference('dark')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all ${
                        preference === 'dark' || (preference === 'system' && document.documentElement.classList.contains('dark'))
                          ? 'bg-secondary text-foreground shadow-sm border border-border/50'
                          : 'text-muted-foreground hover:text-foreground border border-transparent'
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => setPreference('light')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all ${
                        preference === 'light' || (preference === 'system' && !document.documentElement.classList.contains('dark'))
                          ? 'bg-secondary text-foreground shadow-sm border border-border/50'
                          : 'text-muted-foreground hover:text-foreground border border-transparent'
                      }`}
                    >
                      Light
                    </button>
                  </div>
                </div>
              </section>

              {/* Updates */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Updates</h3>
                <div className={`flex items-center justify-between gap-3.5 rounded-xl px-4 py-3.5 border transition-colors ${hasNewVersion ? 'bg-primary/[0.07] border-primary/20' : 'bg-secondary/25 border-border/40'}`}>
                  {hasNewVersion ? (
                    <>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          Update available
                          <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Version {appVersion || '—'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs px-3 shrink-0 gap-1.5"
                        onClick={() => window.electronAPI.openExternalLink(RELEASES_URL)}
                      >
                        Get Update
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          YT-Forge is up to date
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Version {appVersion || '—'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs px-3 shrink-0 gap-1.5 bg-background hover:bg-secondary/80 border border-border/40 transition-colors"
                        onClick={() => window.electronAPI.openExternalLink(RELEASES_URL)}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        Releases
                      </Button>
                    </>
                  )}
                </div>
              </section>

              {/* Feedback */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Community</h3>
                <div className="flex items-center justify-between gap-3.5 rounded-xl px-4 py-3.5 border border-border/40 bg-secondary/25">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-4">
                    <span className="text-sm font-medium text-foreground">Join the Discussion</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Report bugs, request features, or share feedback on GitHub.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs px-3 shrink-0 gap-1.5 bg-background hover:bg-secondary/80 border border-border/40 transition-colors"
                    onClick={() => window.electronAPI.openExternalLink(FEEDBACK_URL)}
                  >
                    <Github className="w-3.5 h-3.5 text-muted-foreground" />
                    Discuss
                  </Button>
                </div>
              </section>

            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              
              {/* YouTube Account */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-soft">YouTube Account</h3>
                {isAuthenticated ? (
                  <div className="rounded-xl border border-border/40 bg-secondary/25 px-4 py-3.5 flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-background border border-border/50 shrink-0">
                      <GoogleIcon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        Signed in
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                      </span>
                      <span className="text-xs text-muted-foreground">Age-restricted downloads enabled</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 px-2.5 text-muted-foreground hover:text-foreground shrink-0">
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Sign out of YouTube?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You won't be able to download age-restricted videos until you sign in again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={logoutYoutube} className="bg-destructive text-white hover:bg-destructive/90">
                            Sign Out
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-secondary/25 p-4 space-y-3.5">
                    {authExpired ? (
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500/80 mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Your session has expired. Sign in again to keep downloading{' '}
                          <strong className="text-foreground/80 font-medium">age-restricted videos</strong>.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Sign in to download <strong className="text-foreground/80 font-medium">age-restricted videos</strong>.
                        Everything else works without an account.
                      </p>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="w-full h-9 bg-white text-neutral-900 border border-black/10 hover:bg-neutral-50 dark:border-transparent dark:hover:bg-white/90 shadow-sm transition-all"
                    >
                      {isLoggingIn ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <GoogleIcon className="w-4 h-4 mr-2" />
                      )}
                      <span className="font-medium text-sm">Sign in with Google</span>
                    </Button>
                  </div>
                )}
              </section>

              {/* Privacy */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Privacy</h3>
                <div className="rounded-xl border border-border/40 bg-secondary/25 overflow-hidden">
                  <div className="flex items-center gap-3.5 px-4 py-3.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-background border border-border/50 shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-500/80" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">Your data stays on this device</span>
                      <span className="text-xs text-muted-foreground">Nothing is tracked or logged.</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs px-3 shrink-0 gap-1.5 bg-background hover:bg-secondary/80 border border-border/40 transition-colors"
                      onClick={() => window.electronAPI.openExternalLink(PRIVACY_URL)}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      Details
                    </Button>
                  </div>
                  <ul className="border-t border-border/30 px-4 py-3 space-y-2">
                    {[
                      'Google handles sign-in; your password is never seen.',
                      'Your session is stored locally and deleted when you sign out.',
                      'History and settings are kept only on your computer.',
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check className="w-3.5 h-3.5 text-muted-foreground/70 mt-px shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-2 shrink-0">
          {/* No native `title` alongside this: the OS tooltip would surface a
              second copy a beat after the styled one. aria-label still carries
              the accessible name. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground/70 hover:text-foreground shrink-0"
                onClick={() => window.electronAPI.openExternalLink(GITHUB_URL)}
                aria-label="Check yt-forge on github"
              >
                <Github className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="text-xs">
              YT-Forge Github ↗
            </TooltipContent>
          </Tooltip>
          
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs font-medium m-0 bg-background" onClick={closeSettings}>
            Close
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SettingsDialog;

import { FormEvent, useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { changePassword, updateProfile } from '../../lib/api';

type DashboardUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  restaurantId?: string;
  onboardingComplete?: boolean;
};

interface DashboardProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: DashboardUser | null;
  onUserUpdate: (user: DashboardUser) => void;
}

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

export function DashboardProfileModal({
  open,
  onOpenChange,
  user,
  onUserUpdate,
}: DashboardProfileModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileMessage('');
    setPasswordMessage('');
    setProfileError('');
    setPasswordError('');
  }, [open, user?.id]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const updated = await updateProfile(name);
      onUserUpdate({ ...user, ...updated });
      setProfileMessage(t('profileDashboard.nameSaved'));
    } catch (error: any) {
      setProfileError(error.response?.data?.message || t('profileDashboard.nameError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword.length < 8) {
      setPasswordError(t('profileDashboard.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profileDashboard.passwordMismatch'));
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(t('profileDashboard.passwordSaved'));
    } catch (error: any) {
      setPasswordError(error.response?.data?.message || t('profileDashboard.passwordError'));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('profileDashboard.title')}
      description={t('profileDashboard.description')}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: 'var(--brand)' }}
          >
            {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user?.email}
            </p>
            <p className="text-xs text-muted-foreground">{user?.role}</p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserRound className="h-4 w-4 text-primary" />
            {t('profileDashboard.personalSection')}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('profileDashboard.displayName')}
            </span>
            <input
              className={inputCls}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('profileDashboard.displayNamePlaceholder')}
            />
          </label>
          {profileError && <p className="text-xs text-destructive">{profileError}</p>}
          {profileMessage && (
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              {profileMessage}
            </p>
          )}
          <Button type="submit" size="sm" disabled={profileSaving}>
            {profileSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t('profileDashboard.saveName')}
          </Button>
        </form>

        <form onSubmit={savePassword} className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" />
            {t('profileDashboard.securitySection')}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('profileDashboard.currentPassword')}
            </span>
            <input
              className={inputCls}
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('profileDashboard.newPassword')}
              </span>
              <input
                className={inputCls}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('profileDashboard.confirmPassword')}
              </span>
              <input
                className={inputCls}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          {passwordMessage && (
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              {passwordMessage}
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t('profileDashboard.changePassword')}
          </Button>
        </form>
      </div>
    </Modal>
  );
}

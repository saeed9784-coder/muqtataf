'use client';

import { useAuth } from '@/lib/auth';
import { useFollow, useMe } from '@/lib/queries';
import { t } from '@/lib/strings';

interface FollowButtonProps {
  kind: 'TAG' | 'SOURCE';
  value: string;
}

export function FollowButton({ kind, value }: FollowButtonProps) {
  const { user, signIn } = useAuth();
  const me = useMe(Boolean(user));
  const follow = useFollow();
  const list = kind === 'TAG' ? me.data?.followedTags : me.data?.followedSources;
  const isFollowing = list?.includes(value) ?? false;

  const onClick = () => {
    if (!user) return void signIn();
    follow.mutate({ kind, value, isFollowing: !isFollowing });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={follow.isPending}
      aria-pressed={isFollowing}
      className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
        isFollowing ? 'border border-border bg-transparent text-text hover:bg-surface-2' : 'bg-text text-bg hover:opacity-90'
      }`}
    >
      {isFollowing ? t.follow.following : t.follow.follow}
    </button>
  );
}

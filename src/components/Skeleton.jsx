import React from 'react';

// Skeleton placeholders shaped like the content they stand in for (uses the shimmer class `.skeleton` from index.css,
// which stops animating for users who prefer reduced motion). Screen readers get one "Loading…" per block.
export function Skeleton({ w = '100%', h = 12, r = 8, style }) {
  return <span className="skeleton" aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkeletonGroup({ label = 'Loading…', children, style }) {
  return (
    <div aria-busy="true" role="status" style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...style }}>
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' };
const row = { display: 'flex', alignItems: 'center', gap: '12px' };

export function MeetingCardSkeleton() {
  return (
    <div style={card}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <div style={row}><Skeleton w={40} h={40} r={20} /><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton w={120} h={12} /><Skeleton w={80} h={10} /></div></div>
        <Skeleton w={110} h={22} r={10} />
      </div>
      <Skeleton h={34} r={10} />
      <div style={{ ...row, justifyContent: 'space-between' }}><Skeleton w={120} h={10} /><Skeleton w={130} h={34} r={12} /></div>
    </div>
  );
}

export function ExpertCardSkeleton() {
  return (
    <div style={card}>
      <div style={row}><Skeleton w={48} h={48} r={24} /><div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><Skeleton w="55%" h={14} /><Skeleton w="35%" h={10} /></div></div>
      <Skeleton h={10} /><Skeleton w="80%" h={10} />
      <div style={{ ...row, justifyContent: 'space-between' }}><Skeleton w={90} h={12} /><Skeleton w={150} h={40} r={20} /></div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <SkeletonGroup label="Loading profile…" style={{ padding: '24px 16px', alignItems: 'center' }}>
      <Skeleton w={88} h={88} r={44} />
      <Skeleton w={160} h={16} /><Skeleton w={110} h={11} />
      <div style={{ display: 'flex', gap: 12, width: '100%' }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={52} r={12} />)}</div>
      <Skeleton h={42} r={14} />
      {[0, 1].map((i) => <div key={i} style={{ ...card, width: '100%' }}><Skeleton w="40%" h={12} /><Skeleton h={120} r={12} /></div>)}
    </SkeletonGroup>
  );
}

export function FormSkeleton({ fields = 4 }) {
  return (
    <SkeletonGroup label="Loading…" style={{ padding: '16px' }}>
      <Skeleton w={80} h={80} r={40} style={{ alignSelf: 'center' }} />
      {Array.from({ length: fields }, (_, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton w={90} h={10} /><Skeleton h={46} r={14} /></div>)}
    </SkeletonGroup>
  );
}

export function ConversationRowSkeleton() {
  return (
    <div style={{ ...row, padding: '12px 4px' }}>
      <Skeleton w={44} h={44} r={22} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton w="45%" h={12} /><Skeleton w="75%" h={10} /></div>
      <Skeleton w={34} h={10} />
    </div>
  );
}

export function MessageBubblesSkeleton() {
  return (
    <SkeletonGroup label="Loading messages…" style={{ padding: '12px' }}>
      {[['55%', 'flex-start'], ['40%', 'flex-end'], ['65%', 'flex-start'], ['30%', 'flex-end'], ['50%', 'flex-start']].map(([w, a], i) => (
        <Skeleton key={i} w={w} h={36} r={16} style={{ alignSelf: a }} />
      ))}
    </SkeletonGroup>
  );
}

export function ListRowSkeleton() {
  return (
    <div style={{ ...row, padding: '14px 12px', borderBottom: '1px solid var(--border-color)' }}>
      <Skeleton w={36} h={36} r={18} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton w="70%" h={11} /><Skeleton w="30%" h={9} /></div>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div style={card}>
      <div style={row}><Skeleton w={40} h={40} r={20} /><div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><Skeleton w="40%" h={12} /><Skeleton w="20%" h={9} /></div></div>
      <Skeleton h={160} r={12} />
      <Skeleton w="90%" h={11} /><Skeleton w="60%" h={11} />
    </div>
  );
}

// Inline error with a retry button: a skeleton never spins forever.
export function LoadError({ message = 'Could not load this. Check your connection.', onRetry }) {
  return (
    <div role="alert" className="form-message error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span>{message}</span>
      {onRetry && <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 10 }} onClick={onRetry}>Retry</button>}
    </div>
  );
}

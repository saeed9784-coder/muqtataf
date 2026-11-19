import Link from 'next/link';
import { EmptyState } from '@/components/States';

export default function NotFound() {
  return (
    <EmptyState message="الصفحة غير موجودة">
      <Link href="/" className="rounded-lg bg-surface-2 px-4 py-2 text-text">العودة إلى الرئيسية</Link>
    </EmptyState>
  );
}

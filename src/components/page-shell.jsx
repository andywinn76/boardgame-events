import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

// Shared page wrapper -- every route used to hand-roll this exact pair of divs
// with a slightly different max-width. `center` is for short, single-focus
// pages (auth, invite claim) that vertically center instead of top-aligning.
export function PageShell({ size = 'lg', center = false, className, children }) {
  return (
    <div className={cn('flex flex-1 justify-center bg-background px-4', center ? 'items-center' : 'py-12')}>
      <div className={cn('w-full space-y-6', SIZES[size] || SIZES.lg, className)}>{children}</div>
    </div>
  );
}

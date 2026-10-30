import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  FileText,
  FlaskConical,
  LayoutGrid,
  BarChart3,
  Bell,
  BookText,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Home,
  Lock,
  type LucideIcon,
  Minus,
  MoreVertical,
  Package,
  Plus,
  Pill,
  Settings,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';

/**
 * Central icon set. Screens reference stable semantic names (`<Icon name="home" />`)
 * rather than importing lucide components directly, so the icon *choice* for each
 * concept lives in one place and can be swapped without touching screens. Icons
 * render inline SVG with `currentColor` (offline-safe, no icon font) and take
 * Tailwind sizing via `className`; only the icons referenced here are bundled.
 *
 * Recognizable icons carry real weight in this product — the target users are
 * lower-literacy (PRD §13), so an icon is often read before its label.
 */
export type IconName =
  | 'arrow-right'
  | 'calendar'
  | 'finance'
  | 'laboratory'
  | 'pharmacy'
  | 'settings'
  | 'modules'
  | 'home'
  | 'patients'
  | 'encounter'
  | 'registers'
  | 'referrals'
  | 'month'
  | 'stock'
  | 'bell'
  | 'search'
  | 'scan'
  | 'plus'
  | 'print'
  | 'back'
  | 'chevron'
  | 'sync'
  | 'warning'
  | 'check'
  | 'close'
  | 'clock'
  | 'lock'
  | 'trend-up'
  | 'trend-down'
  | 'trend-flat'
  | 'more'
  | 'chevron-down';

const ICONS: Record<IconName, LucideIcon> = {
  'arrow-right': ArrowRight,
  calendar: CalendarDays,
  finance: FileText,
  laboratory: FlaskConical,
  pharmacy: Pill,
  settings: Settings,
  modules: LayoutGrid,
  home: Home,
  patients: Users,
  encounter: Stethoscope,
  registers: BookText,
  referrals: ArrowLeftRight,
  month: BarChart3,
  stock: Package,
  bell: Bell,
  search: Search,
  scan: ScanLine,
  plus: Plus,
  print: Printer,
  back: ChevronLeft,
  chevron: ChevronRight,
  sync: RefreshCw,
  warning: TriangleAlert,
  check: Check,
  close: X,
  clock: Clock,
  lock: Lock,
  'trend-up': TrendingUp,
  'trend-down': TrendingDown,
  'trend-flat': Minus,
  more: MoreVertical,
  'chevron-down': ChevronDown,
};

type Props = {
  name: IconName;
  className?: string;
  /** Accessible label. Provide when the icon is the sole label for a control. */
  title?: string;
};

export const Icon = ({ name, className = 'h-5 w-5', title }: Props) => {
  const Glyph = ICONS[name];
  return (
    <Glyph
      className={`flex-none ${className}`}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
    />
  );
};

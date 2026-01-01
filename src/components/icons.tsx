/**
 * Centralized Icon Library (shadcn pattern)
 *
 * All icons should be imported from this file, not directly from lucide-react.
 * This makes future icon library swaps trivial (one-file change).
 *
 * Usage:
 *   import { Icons } from '@/components/icons'
 *   <Icons.search className="size-4" />
 *
 * For icon prop types:
 *   import { Icons, type Icon } from '@/components/icons'
 *   type Props = { icon: Icon }
 */

import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpCircle,
  Book,
  BookOpen,
  Brain,
  Briefcase,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Circle,
  Clock,
  Code2,
  Coins,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  EyeOff,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileQuestion,
  FileSearch,
  FileText,
  Gift,
  Globe,
  GraduationCap,
  GripVertical,
  Hammer,
  Image,
  Info,
  Key,
  Lightbulb,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MessagesSquare,
  Mic,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Package,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Share,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Square,
  StopCircle,
  Swords,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  User,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

// Re-export the icon type for prop typing
export type Icon = LucideIcon;
export type IconProps = LucideProps;

// Centralized icon map - single source of truth
export const Icons = {
  // Alerts & Status
  alertCircle: AlertCircle,
  alertTriangle: AlertTriangle,
  triangleAlert: TriangleAlert,
  checkCircle: CheckCircle,
  xCircle: XCircle,

  // Arrows & Navigation
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  arrowUpCircle: ArrowUpCircle,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronsUpDown: ChevronsUpDown,

  // Actions
  check: Check,
  copy: Copy,
  download: Download,
  externalLink: ExternalLink,
  lock: Lock,
  logOut: LogOut,
  minus: Minus,
  pencil: Pencil,
  pin: Pin,
  plus: Plus,
  refreshCw: RefreshCw,
  search: Search,
  share: Share,
  trash: Trash2,
  upload: Upload,
  x: X,

  // Files & Documents
  book: Book,
  bookOpen: BookOpen,
  file: File,
  fileCode: FileCode,
  fileImage: FileImage,
  fileJson: FileJson,
  fileQuestion: FileQuestion,
  fileSearch: FileSearch,
  fileText: FileText,

  // Communication
  mail: Mail,
  messageSquare: MessageSquare,
  messagesSquare: MessagesSquare,
  mic: Mic,
  paperclip: Paperclip,

  // UI Elements
  calendar: Calendar,
  circle: Circle,
  clock: Clock,
  code: Code2,
  eyeOff: EyeOff,
  globe: Globe,
  gripVertical: GripVertical,
  image: Image,
  info: Info,
  loader: Loader2,
  menu: Menu,
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,
  package: Package,
  panelLeft: PanelLeft,
  slidersHorizontal: SlidersHorizontal,
  sparkles: Sparkles,
  square: Square,
  stopCircle: StopCircle,
  zap: Zap,

  // Finance & Commerce
  coins: Coins,
  creditCard: CreditCard,
  gift: Gift,

  // Users & Roles
  briefcase: Briefcase,
  graduationCap: GraduationCap,
  key: Key,
  shieldAlert: ShieldAlert,
  user: User,
  users: Users,

  // Concepts & Ideas
  brain: Brain,
  hammer: Hammer,
  lightbulb: Lightbulb,
  scale: Scale,
  swords: Swords,
  target: Target,
  trendingUp: TrendingUp,
  wrench: Wrench,

  // Feedback
  thumbsDown: ThumbsDown,
  thumbsUp: ThumbsUp,

  // Connectivity
  wifi: Wifi,
  wifiOff: WifiOff,
  database: Database,
} as const;

// Type for icon keys (useful for dynamic icon selection)
export type IconName = keyof typeof Icons;

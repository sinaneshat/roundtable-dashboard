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
  Camera,
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
  Eye,
  EyeOff,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileQuestion,
  FileSearch,
  FileText,
  FileX,
  Gift,
  Globe,
  GraduationCap,
  GripVertical,
  Hammer,
  House,
  Image,
  Infinity as InfinityIcon,
  Info,
  Key,
  Layers,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
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
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Share,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareStack,
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
  UserCheck,
  UserCog,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

export type Icon = LucideIcon;
export type IconProps = LucideProps;

// Custom SVG brand icons (forwardRef to match Lucide pattern)
function RedditIcon({ ref, ...props }: LucideProps & { ref?: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" width={24} height={24} {...props}>
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}
RedditIcon.displayName = 'RedditIcon';

function TwitterIcon({ ref, ...props }: LucideProps & { ref?: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" width={24} height={24} {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
TwitterIcon.displayName = 'TwitterIcon';

function InstagramIcon({ ref, ...props }: LucideProps & { ref?: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" width={24} height={24} {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}
InstagramIcon.displayName = 'InstagramIcon';

export const Icons = {
  // Alerts & Status
  alertCircle: AlertCircle,
  alertTriangle: AlertTriangle,
  // Arrows & Navigation
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,

  arrowUp: ArrowUp,
  arrowUpCircle: ArrowUpCircle,
  // Files & Documents
  book: Book,
  bookOpen: BookOpen,
  // Concepts & Ideas
  brain: Brain,
  // Users & Roles
  briefcase: Briefcase,
  // UI Elements
  calendar: Calendar,
  // Actions
  camera: Camera,
  check: Check,
  checkCircle: CheckCircle,
  chevronDown: ChevronDown,

  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsUpDown: ChevronsUpDown,
  chevronUp: ChevronUp,
  circle: Circle,
  clock: Clock,
  code: Code2,
  // Finance & Commerce
  coins: Coins,
  copy: Copy,
  creditCard: CreditCard,
  database: Database,
  download: Download,
  externalLink: ExternalLink,
  eye: Eye,
  eyeOff: EyeOff,
  file: File,
  fileCode: FileCode,
  fileImage: FileImage,
  fileJson: FileJson,
  fileQuestion: FileQuestion,
  fileSearch: FileSearch,

  fileText: FileText,
  fileX: FileX,
  gift: Gift,
  globe: Globe,
  graduationCap: GraduationCap,
  gripVertical: GripVertical,
  hammer: Hammer,
  home: House,
  image: Image,
  infinity: InfinityIcon,

  info: Info,
  instagram: InstagramIcon,
  key: Key,
  layers: Layers,
  lightbulb: Lightbulb,

  loader: Loader2,
  lock: Lock,
  lockOpen: LockOpen,
  logOut: LogOut,
  // Communication
  mail: Mail,
  menu: Menu,
  messageSquare: MessageSquare,
  messagesSquare: MessagesSquare,
  mic: Mic,
  minus: Minus,
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,
  package: Package,
  panelLeft: PanelLeft,
  paperclip: Paperclip,
  pause: Pause,
  pencil: Pencil,
  pin: Pin,
  play: Play,
  plus: Plus,
  // Brand/Social
  reddit: RedditIcon,
  refreshCw: RefreshCw,

  scale: Scale,
  search: Search,
  share: Share,

  shieldAlert: ShieldAlert,
  slidersHorizontal: SlidersHorizontal,
  sparkles: Sparkles,
  square: Square,
  squareStack: SquareStack,
  stopCircle: StopCircle,
  swords: Swords,
  target: Target,

  // Feedback
  thumbsDown: ThumbsDown,
  thumbsUp: ThumbsUp,
  trash: Trash2,
  trendingUp: TrendingUp,
  triangleAlert: TriangleAlert,
  twitter: TwitterIcon,
  upload: Upload,
  user: User,
  userCheck: UserCheck,
  userCog: UserCog,

  users: Users,
  video: Video,

  // Audio
  volume2: Volume2,
  volumeX: VolumeX,
  // Connectivity
  wifi: Wifi,

  wifiOff: WifiOff,
  wrench: Wrench,

  x: X,
  xCircle: XCircle,
  zap: Zap,
} as const;

export type IconName = keyof typeof Icons;

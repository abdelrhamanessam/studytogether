import { forwardRef, type ImgHTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-xl",
} as const;

export type AvatarSize = keyof typeof sizeMap;

export interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size" | "src"> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
  showLevelRing?: boolean;
  level?: number;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt = "", fallback, size = "md", showLevelRing, level, className, ...props }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = src && !imgError;
    const initials = getInitials(fallback || alt || "?");

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
          sizeMap[size],
          showLevelRing && "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse-glow",
          className,
        )}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt}
            onError={() => setImgError(true)}
            className="h-full w-full rounded-full object-cover"
            {...props}
          />
        ) : (
          <span className="select-none">{initials}</span>
        )}
        {showLevelRing && level !== undefined && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow-sm">
            {level}
          </span>
        )}
      </div>
    );
  },
);

Avatar.displayName = "Avatar";

export { Avatar };

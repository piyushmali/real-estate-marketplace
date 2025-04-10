import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[7px] text-xs font-medium shadow-sm",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground px-2.5 py-0.5",
        secondary:
          "bg-secondary text-secondary-foreground px-2.5 py-0.5",
        destructive:
          "bg-destructive text-destructive-foreground px-2.5 py-0.5",
        outline:
          "text-foreground border border-input px-2.5 py-0.5",
        success:
          "bg-green-500 text-white px-2.5 py-0.5",
        warning:
          "bg-amber-500 text-white px-2.5 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

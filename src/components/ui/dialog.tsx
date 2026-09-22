"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className="dialog-content">
          <div className="dialog-heading">
            <D.Title>{title}</D.Title>
            <D.Close aria-label="閉じる" className="icon-button">
              <X size={18} />
            </D.Close>
          </div>
          <D.Description
            className={description ? "muted text-sm mb-5" : "sr-only"}
          >
            {description ?? title}
          </D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

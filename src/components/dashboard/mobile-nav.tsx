"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import type { NavItem } from "@/lib/nav";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav(props: { items: NavItem[]; groups: readonly string[]; platformAdmin: boolean; orgName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-xl hover:bg-paper lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-paper p-4 shadow-2xl lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <LogoMark />
                  <span className="truncate font-semibold">{props.orgName}</span>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="grid size-9 place-items-center rounded-lg hover:bg-white"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav {...props} onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

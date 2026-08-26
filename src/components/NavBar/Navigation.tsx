"use client";
import styles from "./NavBar.module.scss";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import type { NavItem } from "@/lib/global";

export default function Navigation({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Ties the toggle to the menu it controls, so assistive tech can report the
  // relationship rather than just "expanded".
  const menuId = useId();

  useEffect(() => {
    // Close when a click lands outside the menu.
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        dropdownRef.current &&
        target instanceof Node &&
        !dropdownRef.current.contains(target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    // Escape closes and returns focus to the toggle, so the keyboard user ends
    // up where they started rather than at the top of the document.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        toggleButtonRef.current?.focus();
        return;
      }

      // Keep Tab inside the open menu. Without this the focus order walks
      // straight past a menu that is visually covering the page, which leaves
      // a keyboard user tabbing through content they cannot see.
      if (event.key !== "Tab" || !menuRef.current) return;

      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
      );
      if (focusable.length === 0) return;

      // Non-empty per the check above, but read as values so the compiler can
      // narrow them rather than trusting an index.
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;

      // The toggle sits outside the menu but is part of the same widget, so
      // shift-tabbing off the first item lands there rather than escaping.
      if (event.shiftKey && active === first) {
        event.preventDefault();
        toggleButtonRef.current?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen, pathname]);

  // Move focus into the menu when it opens, so the next Tab continues from
  // there. Previously the menu appeared but focus stayed on the toggle, and
  // tabbing walked into the page behind it.
  useEffect(() => {
    if (!isDropdownOpen) return;
    menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    setIsDropdownOpen((open) => !open);
  };

  return (
    <>
      <nav className={styles.nav} aria-label="Main">
        {navItems.map((item, index) => (
          <Link
            key={`${item.href}-${index}`}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={`${styles.nav_item} ${pathname === item.href ? styles.active : ""}`}
          >
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <nav className={styles.navSmall} ref={dropdownRef} aria-label="Main">
        <button
          ref={toggleButtonRef}
          onClick={toggleDropdown}
          aria-expanded={isDropdownOpen}
          aria-controls={menuId}
          aria-label={isDropdownOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          <FontAwesomeIcon
            icon={isDropdownOpen ? faTimes : faBars}
            className={styles.navSmallIcon}
          />
        </button>
        {isDropdownOpen && (
          <div id={menuId} ref={menuRef} className={styles.dropdownMenu}>
            {navItems.map((item, index) => (
              <Link
                key={`${item.href}-${index}`}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`${styles.dropdownItem} ${pathname === item.href ? styles.active : ""}`}
                onClick={toggleDropdown}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}

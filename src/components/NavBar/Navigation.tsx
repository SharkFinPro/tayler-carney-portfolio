"use client";
import styles from "./NavBar.module.scss";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import type { NavItem } from "@/lib/global";

export default function Navigation({ navItems }: { navItems: NavItem[] }) {

  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);


  // Close dropdown when clicking outside
  useEffect(() => {
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

    // Close on Escape and return focus to the toggle button.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        toggleButtonRef.current?.focus();
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

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return <>
    <nav className={styles.nav}>
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
    <nav className={styles.navSmall} ref={dropdownRef}>
      <button
        ref={toggleButtonRef}
        onClick={toggleDropdown}
        aria-expanded={isDropdownOpen}
        aria-label="Toggle navigation menu"
      >
        <FontAwesomeIcon
          icon={isDropdownOpen ? faTimes : faBars}
          className={styles.navSmallIcon}
        />
      </button>
      {isDropdownOpen && (
        <div className={styles.dropdownMenu}>
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
}
"use client";
import styles from "./NavBar.module.scss";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

export default function Navigation() {

  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const navItems = [
    { label: "Home", path: "/" },
    { label: "Portfolio", path: "/portfolio" },
    { label: "Atelier", path: "/atelier" },
    { label: "About", path: "/about" },
    { label: "Contact", path: "/contact" }
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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
      {navItems.map((item) => (
        <Link
          key={item.label}
          href={item.path}
          aria-current={pathname === item.path ? "page" : undefined}
          className={`${styles.nav_item} ${pathname === item.path ? styles.active : ""}`}
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
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.path}
              aria-current={pathname === item.path ? "page" : undefined}
              className={`${styles.dropdownItem} ${pathname === item.path ? styles.active : ""}`}
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
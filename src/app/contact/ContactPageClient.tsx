"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Contact.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faFileArrowDown } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import { ImageGridItem } from "@/components/blocks/ImageGrid";
import BlockSection from "@/components/blocks/BlockSection";
// The dark-context block theming lives with the blocks (same CSS module) so it
// can target the block classes; applied to the contact intro panel below.
import blockStyles from "@/components/blocks/BlockSection.module.scss";
import BlockEditor from "@/components/blocks/BlockEditor";
import ProjectModal from "@/app/portfolio/[slug]/ProjectModal";
import { sanitizeBlocks, blockHasData, type Block } from "@/components/blocks/blocks";

interface ContactPageClientProps {
  siteId: string;
  contact: unknown;
  email: string;
  linkedInHandle: string;
  instagramHandle: string;
  /** Resolved resume asset (fresh per render); null hides the download card. */
  resume?: { url: string; name: string } | null;
  isAdmin?: boolean;
}

interface ModalState {
  items: ImageGridItem[];
  index: number;
}

export default function ContactPageClient({
  siteId,
  contact,
  email,
  linkedInHandle,
  instagramHandle,
  resume = null,
  isAdmin = false,
}: ContactPageClientProps) {
  const initialBlocks = useMemo(() => sanitizeBlocks(contact), [contact]);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editing, setEditing] = useState(isAdmin);
  useEffect(() => {
    setBlocks(initialBlocks);
    setEditing(isAdmin);
  }, [initialBlocks, isAdmin]);

  const sectionBlocks = useMemo(() => blocks.filter(blockHasData), [blocks]);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = useCallback((_src: string, _title: string, items: ImageGridItem[], index: number) => {
    setModal({ items, index });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setModal(null), 300);
  }, []);

  const goNext = useCallback(() => {
    setModal((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.items.length } : prev));
  }, []);

  const goPrev = useCallback(() => {
    setModal((prev) => (prev ? { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length } : prev));
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  const socials = [
    {
      title: "LinkedIn",
      handle: `linkedin.com/in/${linkedInHandle}`,
      href: `https://www.linkedin.com/in/${linkedInHandle}`,
      icon: faLinkedin,
    },
    {
      title: "Instagram",
      handle: `@${instagramHandle}`,
      href: `https://instagram.com/${instagramHandle}`,
      icon: faInstagram,
    },
  ];

  // The email + socials are sourced from the SiteData scalars (edited in admin
  // settings), not the block layout — so they live outside the editor.
  const channels = (
    <div className={styles.right}>
      <div className={styles.contactItem}>
        <span className={styles.sectionLabel}>Email</span>
        <a href={`mailto:${email}`} className={styles.emailButton}>
          <div className={styles.emailButtonInner}>
            <FontAwesomeIcon icon={faEnvelope} className={styles.emailButtonIcon} />
            <span className={styles.emailButtonText}>Send an Email</span>
            <span className={styles.emailButtonArrow}>↗</span>
          </div>
        </a>
        <span className={styles.emailAddress}>{email}</span>
      </div>

      {resume && (
        <div className={styles.contactItem}>
          <span className={styles.sectionLabel}>Resume</span>
          <a
            href={resume.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emailButton}
            title={resume.name}
          >
            <div className={styles.emailButtonInner}>
              <FontAwesomeIcon icon={faFileArrowDown} className={styles.emailButtonIcon} />
              <span className={styles.emailButtonText}>Download Resume</span>
              <span className={styles.emailButtonArrow}>↗</span>
            </div>
          </a>
          <span className={styles.emailAddress}>{resume.name}</span>
        </div>
      )}

      <div className={styles.contactItem}>
        <span className={styles.sectionLabel}>Online</span>
        <div className={styles.socialList}>
          {socials.map((s) => (
            <a
              key={s.title}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.socialCard}
            >
              <div className={styles.socialCardInner}>
                <FontAwesomeIcon icon={s.icon} className={styles.socialIcon} />
                <div className={styles.socialCardInfo}>
                  <span className={styles.socialCardTitle}>{s.title}</span>
                  <span className={styles.socialCardHandle}>{s.handle}</span>
                </div>
              </div>
              <span className={styles.socialArrow}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ProjectModal
        modal={modal}
        modalVisible={modalVisible}
        closeModal={closeModal}
        goNext={goNext}
        goPrev={goPrev}
      />
      <div className={styles.pageWrapper}>
        <div className={styles.pageContainer}>
          {isAdmin && (
            <button type="button" onClick={() => setEditing((e) => !e)} className={styles.editToggle}>
              {editing ? "Preview" : "Exit preview"}
            </button>
          )}

          {editing ? (
            <>
              <BlockEditor
                model="SiteData"
                field="contact"
                id={siteId}
                initialBlocks={blocks}
                onBlocksChange={setBlocks}
              />
              <div className={styles.channelsStandalone}>{channels}</div>
            </>
          ) : (
            <div className={styles.grid}>
              <div className={`${styles.left} ${blockStyles.contactDark}`}>
                {sectionBlocks.map((block) => (
                  <BlockSection key={block.id} block={block} onOpen={openModal} />
                ))}
              </div>
              {channels}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

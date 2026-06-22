"use client";
import Image from "next/image";
import styles from "./Project.module.scss";
import Modal from "@/components/Modal";

interface ImageGridItem {
  url: string;
  title: string;
  description?: string;
  alt?: string;
}

interface ProjectModalProps {
  modal: {
    items: ImageGridItem[];
    index: number;
  } | null;
  modalVisible: boolean;
  closeModal: () => void;
  goNext: () => void;
  goPrev: () => void;
}

export default function ProjectModal({ modal, modalVisible, closeModal, goNext, goPrev }: ProjectModalProps) {
  if (!modal) return null;

  const currentModalItem = modal.items[modal.index];
  if (!currentModalItem) return null;

  return (
    <Modal
      onClose={closeModal}
      labelledBy="modal-title"
      overlayClassName={`${styles.modalOverlay} ${modalVisible ? styles.visible : ""}`}
    >
      <div className={styles.modalInner}>
        <div className={styles.modalHeader}>
          <span id="modal-title">{currentModalItem.title}</span>
          <div className={styles.modalControls}>
            {modal.items.length > 1 && (
              <span className={styles.modalCounter}>
                {modal.index + 1} / {modal.items.length}
              </span>
            )}
            <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Close
            </button>
          </div>
        </div>
        <div className={styles.modalBody}>
          {modal.items.length > 1 && (
            <button
              className={`${styles.modalNav} ${styles.modalNavPrev}`}
              onClick={goPrev}
              aria-label="Previous image"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <Image
            src={currentModalItem.url}
            alt={currentModalItem.alt ?? currentModalItem.title}
            width={1600}
            height={900}
          />
          {modal.items.length > 1 && (
            <button
              className={`${styles.modalNav} ${styles.modalNavNext}`}
              onClick={goNext}
              aria-label="Next image"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

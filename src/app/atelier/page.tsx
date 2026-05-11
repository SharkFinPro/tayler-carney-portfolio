import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Atelier"
};

export const dynamic = "force-dynamic";

export default function Atelier() {
  return (
    <>
      <h1>Atelier</h1>
    </>
  )
}
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="narrow">
      <h1>That page is not here</h1>
      <p className="lede">
        The company may not be on file yet. <Link href="/lookup">Look it up</Link> or go back to the{" "}
        <Link href="/">company list</Link>.
      </p>
    </div>
  );
}

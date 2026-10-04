/**
 * Minimal POP3-over-TLS client (Oct 2026) for collecting the support inbox
 * copy from the local mail server. Only what the collector needs: login,
 * list, retrieve, delete, quit. No dependencies.
 */

import tls from "node:tls";

export interface Pop3Options {
  host: string;
  port: number;
  servername: string;
  user: string;
  pass: string;
  timeoutMs?: number;
}

export class Pop3Client {
  private socket: tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private waiter: (() => void) | null = null;
  private failed: Error | null = null;

  constructor(private readonly opts: Pop3Options) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const s = tls.connect({ host: this.opts.host, port: this.opts.port, servername: this.opts.servername }, () => resolve());
      s.setTimeout(this.opts.timeoutMs ?? 30_000, () => s.destroy(new Error("POP3 timeout")));
      s.on("data", (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.waiter?.();
      });
      s.on("error", (err) => {
        this.failed = err;
        this.waiter?.();
        reject(err);
      });
      s.on("close", () => {
        this.failed ??= new Error("POP3 connection closed");
        this.waiter?.();
      });
      this.socket = s;
    });
    await this.readLine(); // greeting
    await this.command(`USER ${this.opts.user}`);
    await this.command(`PASS ${this.opts.pass}`);
  }

  private async waitForData(): Promise<void> {
    if (this.failed) throw this.failed;
    await new Promise<void>((r) => (this.waiter = r));
    this.waiter = null;
    if (this.failed && this.buffer.length === 0) throw this.failed;
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const i = this.buffer.indexOf("\r\n");
      if (i >= 0) {
        const line = this.buffer.subarray(0, i).toString("latin1");
        this.buffer = this.buffer.subarray(i + 2);
        if (!line.startsWith("+OK")) throw new Error(`POP3: ${line.slice(0, 120)}`);
        return line;
      }
      await this.waitForData();
    }
  }

  /** Multi-line body ending "\r\n.\r\n", with dot-stuffing removed. */
  private async readMultiline(): Promise<Buffer> {
    for (;;) {
      const end = this.buffer.indexOf("\r\n.\r\n");
      const empty = this.buffer.subarray(0, 3).toString("latin1") === ".\r\n";
      if (empty) {
        this.buffer = this.buffer.subarray(3);
        return Buffer.alloc(0);
      }
      if (end >= 0) {
        const body = this.buffer.subarray(0, end + 2);
        this.buffer = this.buffer.subarray(end + 5);
        return unstuff(body);
      }
      await this.waitForData();
    }
  }

  private async command(cmd: string): Promise<string> {
    if (!this.socket) throw new Error("POP3 not connected");
    this.socket.write(`${cmd}\r\n`);
    return this.readLine();
  }

  /** Message numbers and sizes currently in the mailbox. */
  async list(): Promise<{ n: number; size: number }[]> {
    await this.command("LIST");
    const body = (await this.readMultiline()).toString("latin1");
    return body
      .split("\r\n")
      .filter(Boolean)
      .map((l) => {
        const [n, size] = l.split(" ").map(Number);
        return { n, size };
      });
  }

  async retrieve(n: number): Promise<Buffer> {
    await this.command(`RETR ${n}`);
    return this.readMultiline();
  }

  async delete(n: number): Promise<void> {
    await this.command(`DELE ${n}`);
  }

  /** QUIT commits deletions. */
  async quit(): Promise<void> {
    try {
      await this.command("QUIT");
    } finally {
      this.socket?.end();
    }
  }

  destroy(): void {
    this.socket?.destroy();
  }
}

/** Remove POP3 dot-stuffing: a line starting ".." becomes ".". */
export function unstuff(body: Buffer): Buffer {
  const s = body.toString("latin1");
  return Buffer.from(s.replace(/(^|\r\n)\.\./g, "$1."), "latin1");
}

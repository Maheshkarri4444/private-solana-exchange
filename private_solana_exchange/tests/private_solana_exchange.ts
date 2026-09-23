import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { PrivateSolanaExchange } from "../target/types/private_solana_exchange";

describe("PrivateSolanaExchange", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .PrivateSolanaExchange as Program<PrivateSolanaExchange>;

  it("loads the program", async () => {
    console.log("Program ID:", program.programId.toBase58());
  });
});

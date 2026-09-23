// Arcis circuits (encrypted instructions) for the private exchange.
//
// NOTE: the `#[encrypted]` macro requires at least one `#[instruction]` inside
// it, so the module stays commented out until the first circuit is written.
//
// #[encrypted]
// mod circuits {
//     use arcis::*;
//
//     #[instruction]
//     pub fn example(input: Enc<Shared, u8>) -> Enc<Shared, u8> {
//         input
//     }
// }

# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.2.0] - 2025-09-15
### Added
- Support for decoding codama program logs (#25)

## [6.1.2] - 2025-09-11
### Fixed
- Parsing transactions where innerTransactions is null (#23)

## [6.1.1] - 2025-09-10
### Added
- Decoder related logging to understand why data cannot be decoded (#21)

## [6.1.0] - 2025-09-09
### Removed
- ethersjs dependency and correct sdk version in meta (#19)

### Changed
- Update solana and codama dependencies (#19)

### Fixed
- dictionary being used when no handler filter was provided (#19)

### Added
- Provide decoder functions into the sandbox (#19)

## [6.0.7] - 2025-08-28
### Fixed
- Missing internal dependency from test subcommand

## [6.0.6] - 2025-08-28
### Fixed
- Unfinalized blocks not working (#16)

## [6.0.5] - 2025-07-24
### Changed
- Update @subql dependencies (#14)

## [6.0.4] - 2025-07-01
### Changed
- Update `@subql/common` and `@subql/node-core` (#12)

## [6.0.3] - 2025-05-29
### Fixed
- Decoding instruction and log data when not needed, leading to warning logs (#10)

## [6.0.2] - 2025-05-28
### Fixed
- All endpoints failed error with workers (#8)

## [6.0.1] - 2025-05-27
### Changed
- Add retries to getting finalized header (#6)

## [6.0.0] - null
### Changed
- Initial release

[Unreleased]: https://github.com/subquery/subql-solana/compare/node-solana/6.2.0...HEAD
[6.2.0]: https://github.com/subquery/subql-solana/compare/node-solana/6.1.2...node-solana/6.2.0
[6.1.2]: https://github.com/subquery/subql-solana/compare/node-solana/6.1.1...node-solana/6.1.2
[6.1.1]: https://github.com/subquery/subql-solana/compare/node-solana/6.1.0...node-solana/6.1.1
[6.1.0]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.7...node-solana/6.1.0
[6.0.7]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.6...node-solana/6.0.7
[6.0.6]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.5...node-solana/6.0.6
[6.0.5]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.4...node-solana/6.0.5
[6.0.4]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.3...node-solana/6.0.4
[6.0.3]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.2...node-solana/6.0.3
[6.0.2]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.1...node-solana/6.0.2
[6.0.1]: https://github.com/subquery/subql-solana/compare/node-solana/6.0.0...node-solana/6.0.1
[6.0.0]: https://github.com/subquery/subql-solana/releases/tag/node-solana/6.0.0

{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    utils.url = "github:numtide/flake-utils";
    custom.url = "github:kotatsuyaki/nix-config";
    custom.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, utils, custom }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            deno
            nodejs
            rnix-lsp
            custom.packages.${system}.nodePackages.serverless
            custom.packages.${system}.nodePackages.serverless-scriptable-plugin
          ];
          /* shellHook = ''
            export PATH=$PWD/node_modules/.bin:$PATH
            ''; */
        };
      });
}

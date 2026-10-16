"""Compatibility entrypoint for the unified canonical contract generator."""
from generate_contracts import generate
import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    generate(check=parser.parse_args().check)

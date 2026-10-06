"""Native desktop entry; current application remains explicitly offline."""
import tkinter as tk
import argparse
from app import App

if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument('--browser',choices=('chrome','msedge'),default='chrome');args=parser.parse_args()
    root = tk.Tk()
    App(root,browser_channel=args.browser)
    root.mainloop()

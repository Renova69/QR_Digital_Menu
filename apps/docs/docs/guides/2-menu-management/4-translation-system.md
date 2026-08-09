---
id: translation-system
title: Auto-Translation System
sidebar_position: 4
---

# Auto-Translation System

A core feature of the platform is the fully automated menu translation system powered by DeepL. By serving a multilingual menu, you can cater to tourists and diverse demographics without any extra manual effort.

## How It Works

You create your menu in your primary language (e.g., Bulgarian or English). The system takes care of the rest automatically. There are three ways translations occur:

1. **Background Pre-warming**: Whenever you create or update a category, item, or option, the system silently translates it into your configured target languages in the background. It does not slow down your workflow.
2. **Lazy On-Demand**: If a customer selects a language on the public menu that hasn't been translated yet, the platform intercepts the request, calls DeepL, caches the result in the database, and serves the fully translated menu. The cache ensures subsequent visits are lightning-fast.
3. **Manual Batch Translation**: If you want to force-translate your entire menu at once, you can go to **Settings > Localization** and click "Translate All Now". 

## Managing Languages

In your Dashboard **Settings**, you can specify which languages you want to target. The public menu currently supports up to 12 locales, including EN, BG, RO, DE, ES, FR, IT, ZH, EL, JA, RU, and AR.

When a customer visits your menu, the system automatically detects their browser's language preference and serves the appropriate translation. They can also manually change the language using the flags in the top navigation bar.

## What Gets Translated?
The system translates almost everything, including:
- Category names
- Item names and descriptions
- Menu option variations (e.g., "Medium Rare")
- Dietary tags and allergen warnings

## Platform Managed
Unlike other systems that require you to generate and manage your own API keys, our DeepL integration is fully managed by the platform. You do not need to configure API keys or pay for translation quotas directly.

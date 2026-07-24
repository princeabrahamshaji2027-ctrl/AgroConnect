You are my senior UI/UX engineer and frontend architect.

We are **NOT building the backend or business logic yet.**

Your first task is to build the **complete UI skeleton** of the Agro Connect application with production-quality code, reusable components, routing, navigation, animations, and responsive layouts.

The objective is to make the application feel completely real while using temporary/mock data.

---

# IMPORTANT

I have created a folder named

AgroConnect

Inside it there is another folder


ui

Inside the **ui** folder are all the UI reference images that you must use as the design source.

Examples include

* Login Page
* Landing / Feed Page
* User Profile Page
* Admin Dashboard
* (Any future UI images placed inside this folder)

Treat these images as the official design reference.

Do not redesign them.

Do not replace them.

Instead recreate them as accurately as possible using reusable frontend components.

---

# Logo

Inside my project I have another folder named

```
logo/
```

This folder contains the **official Agro Connect logo.**

Some UI mockups were created using different AI tools, so the logos shown inside those images are inconsistent.

Ignore every logo shown in the UI screenshots.

Wherever the application displays a logo,

always use ONLY the logo stored inside

```
logo/
```

Never generate another version.

Never redraw it.

Never replace it.

Use this same logo everywhere.

Examples

* Login Screen
* Splash Screen
* Navigation Bar
* Admin Dashboard
* About Page
* Loading Screen
* Empty States
* Settings
* Any future page

The logo must remain consistent throughout the application.

---

# Current Goal

Build only the frontend.

No backend.

No database.

No authentication.

No APIs.

No AI features.

No Firebase.

No Supabase.

No server.

No payment integration.

Use mock JSON data wherever necessary.

The application should look and behave exactly like a finished application while using dummy data.

---

# Navigation

Every button should work.

Every page should be connected.

Routing must be fully functional.

When a button is clicked,

navigate to the proper screen.

No dead buttons.

No placeholder buttons.

Examples

Login button

→ Feed page

Profile button

→ Profile page

Community button

→ Community page

Settings

→ Settings

Admin Dashboard

→ Admin Pages

Back buttons

→ Previous screen

Logout

→ Login page

Notification icon

→ Notification page

Search

→ Search page

Create Post

→ Create Post page

Every navigation should already work.

---

# Pages to Build

Build the complete UI skeleton for all screens, even if they contain mock data.

Include:

### Splash Screen

Uses official logo.

Simple animation.

Automatically opens Login.

---

### Login Screen

Exactly matches the UI reference.

Uses official logo.

Contains

Email / Username

Password

Show Password

Forgot Password

Login Button

Continue with Google

Sign Up

Buttons should navigate properly.

---

### Registration Screen

Name

Username

Email

Phone

Password

Confirm Password

Create Account

Already have an account

Continue with Google

---

### Feed / Landing Page

Exactly matches UI.

Scrollable feed.

Dummy posts.

Working navigation.

Working cards.

Like animation.

Comment page.

Share button.

Bookmark.

Profile click.

Search.

Notification.

Floating Create Post button.

---

### User Profile

Exactly matches UI.

Centered profile picture.

Name

Post count

Short bio

Edit Profile

Share Profile

Create Post (+)

Posts list

No Followers

No Following

No Instagram style tabs

Bottom navigation

---

### Create Post

Image picker placeholder

Caption

Category

Location

Tags

Publish button

Draft button

Cancel

---

### Community Page

Community cards

Groups

Trending topics

Suggested communities

Search

Create Community

Join button

---

### Search Page

Recent searches

Trending

Categories

Users

Posts

Communities

---

### Notifications

Likes

Comments

Mentions

Reports

Announcements

System updates

---

### Chat UI

Conversation list

Individual chat

Attachments

Images

Voice placeholder

Emoji picker

---

### Settings

Dark Mode

Light Mode

Language

Privacy

Notifications

About

Logout

---

### Edit Profile

Change profile picture

Name

Username

Bio

Location

Phone

Save

Cancel

---

### Admin Login

Separate login screen.

Uses same design language.

Official logo.

---

### Admin Dashboard

Exactly match the provided Admin Dashboard reference.

Maintain the same layout.

Mobile optimized.

No redesign.

Include

Dashboard

Statistics

Recent Posts

Recent Users

Reports

Quick Actions

Charts

Notifications

---

### Manage Posts

List

Search

Filter

Create

Edit

Delete

Hide

Pin

Preview

---

### Manage Users

Search

Filter

View

Suspend

Ban

Delete

Moderator

Admin

---

### Reports

Reported Posts

Reported Users

Approve

Reject

Delete

Ban

---

### Category Management

Create

Delete

Disable

Enable

Edit

---

### Notification Center

Announcements

Push notifications

Scheduled notifications

Emergency announcement

---

### Analytics

Charts

Daily Users

Posts

Reports

Growth

Dummy data

---

### Account

Profile

Logout

Preferences

Security

---

# Components

Create reusable components.

Examples

Primary Button

Secondary Button

Input Field

Search Bar

Cards

Profile Card

Post Card

Comment Card

Community Card

Statistics Card

Report Card

Dialog

Bottom Sheet

Snack Bar

Floating Button

Navigation Bar

Header

Avatar

Dropdown

Badge

Tag

Chip

Image Carousel

Modal

Loading Skeleton

Empty State

Error State

Everything should reuse components.

No duplicated code.

---

# Theme

Use the Agro Connect design system.

Dark Mode

Background

#121212

Cards

#1E1E1E

Border

#2A2A2A

Primary Green

#88D982

Secondary Green

#2E7D32

Inter Font

Rounded corners

20px

Glassmorphism header

Smooth shadows

Premium spacing

Material Symbols

Use the exact design language throughout.

---

# Animations

Smooth page transitions

Fade

Slide

Scale

Ripple

Button press animation

Loading animation

Card hover

Like animation

Modal animation

Skeleton loading

Everything should feel polished.

---

# Responsiveness

Optimize for mobile first.

Support

Android

iPhone

Foldables

Safe Area Insets

No overflow

No clipped content

No horizontal scrolling

---

# Code Quality

Use clean architecture.

Separate

Pages

Components

Layouts

Assets

Constants

Navigation

Mock Data

Utilities

Theme

Styles

Avoid duplicate code.

Follow best frontend practices.

---

# Mock Data

Generate realistic dummy

Users

Posts

Communities

Notifications

Comments

Reports

Categories

Messages

Statistics

Images

Everything should look like a live application.

---

# Final Goal

At the end of this phase, the application should behave like a fully designed production app **without any backend**. Every screen should be navigable, every button should lead somewhere meaningful, and the entire experience should feel polished and complete. Once this UI foundation is finished, we will begin integrating backend services, authentication, AI features, databases, notifications, and business logic in later phases.

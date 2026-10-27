#!/usr/bin/env python3
"""
AgroConnect Project Presentation Generator
Generates a complete, professional, 20-slide MCA Project Review PowerPoint presentation
following the exact design style of demo.pptx (16:9 widescreen, dark mode, high contrast,
blue & green accents, cards, structured workflows, screenshots, and full speaker notes).

Student: Prince Abraham Shaji (AJC25MCA-2051)
Guide: Ms. Sona Maria Sebastian
Amal Jyothi College of Engineering (Autonomous), Kanjirappally
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

# Output path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PPTX_PATH = os.path.join(ROOT, "AgroConnect_Project_Review.pptx")
ASSETS_DIR = os.path.join(ROOT, "docs", "presentation_assets")

# Palette constants
COLOR_BG = RGBColor(11, 17, 23)        # #0B1117 Deep dark charcoal
COLOR_CARD = RGBColor(21, 31, 43)      # #151F2B Card / panel surface
COLOR_CARD_BORDER = RGBColor(42, 55, 69) # #2A3745 Subtle border
COLOR_TEXT_MAIN = RGBColor(242, 245, 247) # #F2F5F7 Bright off-white
COLOR_TEXT_MUTED = RGBColor(183, 196, 208) # #B7C4D0 Soft slate grey
COLOR_TEXT_DIM = RGBColor(120, 140, 160) # Muted subtitle / labels
COLOR_ACCENT_BLUE = RGBColor(56, 163, 232) # #38A3E8 Tech cyan / blue
COLOR_ACCENT_GREEN = RGBColor(46, 204, 113) # #2ECC71 Agricultural green
COLOR_ACCENT_AMBER = RGBColor(245, 166, 35) # #F5A623 Alert / warning
COLOR_ACCENT_RED = RGBColor(229, 72, 77)   # #E5484D Danger / error

FONT_TITLE = "Arial"
FONT_BODY = "Arial"

def create_presentation():
    prs = Presentation()
    prs.slide_width = Inches(10.0)
    prs.slide_height = Inches(5.625)
    blank_layout = prs.slide_layouts[6] # completely blank layout

    def set_slide_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(10.0), Inches(5.625))
        bg.fill.solid()
        bg.fill.fore_color.rgb = COLOR_BG
        bg.line.fill.background()
        return bg

    def add_header(slide, title_text, category_text=None):
        top_offset = Inches(0.4)
        if category_text:
            cat_box = slide.shapes.add_textbox(Inches(0.6), top_offset, Inches(8.8), Inches(0.25))
            tf_cat = cat_box.text_frame
            tf_cat.word_wrap = True
            tf_cat.margin_left = tf_cat.margin_right = tf_cat.margin_top = tf_cat.margin_bottom = 0
            p_cat = tf_cat.paragraphs[0]
            p_cat.text = category_text.upper()
            p_cat.font.name = FONT_BODY
            p_cat.font.size = Pt(9.5)
            p_cat.font.bold = True
            p_cat.font.color.rgb = COLOR_ACCENT_BLUE
            top_offset += Inches(0.24)

        title_box = slide.shapes.add_textbox(Inches(0.6), top_offset, Inches(8.8), Inches(0.55))
        tf = title_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title_text
        p.font.name = FONT_TITLE
        p.font.size = Pt(22)
        p.font.bold = True
        p.font.color.rgb = COLOR_TEXT_MAIN

    def add_footer(slide, slide_num):
        # Subtle horizontal dividing line
        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(5.15), Inches(8.8), Inches(0.015))
        line.fill.solid()
        line.fill.fore_color.rgb = COLOR_CARD_BORDER
        line.line.fill.background()

        # Footer text
        box = slide.shapes.add_textbox(Inches(0.6), Inches(5.2), Inches(7.5), Inches(0.3))
        tf = box.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = "AGROCONNECT  ·  MCA PROJECT REVIEW"
        p.font.name = FONT_BODY
        p.font.size = Pt(8.5)
        p.font.color.rgb = COLOR_TEXT_DIM

        # Slide Number
        box_num = slide.shapes.add_textbox(Inches(8.4), Inches(5.2), Inches(1.0), Inches(0.3))
        tf_num = box_num.text_frame
        tf_num.margin_left = tf_num.margin_right = tf_num.margin_top = tf_num.margin_bottom = 0
        p_num = tf_num.paragraphs[0]
        p_num.alignment = PP_ALIGN.RIGHT
        p_num.text = str(slide_num)
        p_num.font.name = FONT_BODY
        p_num.font.size = Pt(9.0)
        p_num.font.bold = True
        p_num.font.color.rgb = COLOR_TEXT_DIM

    def add_card(slide, left, top, width, height, bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1)
        return card

    def add_image_safe(slide, image_filename, left, top, max_width, max_height, caption=None):
        image_path = os.path.join(ASSETS_DIR, image_filename)
        if not os.path.exists(image_path):
            print(f"Warning: Image {image_filename} not found.")
            return None

        # Check aspect ratio
        try:
            with Image.open(image_path) as img:
                w, h = img.size
                aspect = w / h
        except Exception:
            aspect = 1.0

        # Fit within bounding box
        target_w = max_width
        target_h = target_w / aspect
        if target_h > max_height:
            target_h = max_height
            target_w = target_h * aspect

        # Center in provided area
        actual_left = left + (max_width - target_w) / 2
        actual_top = top + (max_height - target_h) / 2

        # Card container / backing
        backing = add_card(slide, actual_left - Inches(0.04), actual_top - Inches(0.04),
                           target_w + Inches(0.08), target_h + Inches(0.08),
                           bg_color=RGBColor(16, 24, 34), border_color=COLOR_ACCENT_BLUE)
        
        pic = slide.shapes.add_picture(image_path, actual_left, actual_top, target_w, target_h)

        if caption:
            cap_box = slide.shapes.add_textbox(left, actual_top + target_h + Inches(0.06), max_width, Inches(0.35))
            tf_cap = cap_box.text_frame
            tf_cap.word_wrap = True
            tf_cap.margin_left = tf_cap.margin_right = tf_cap.margin_top = tf_cap.margin_bottom = 0
            p_cap = tf_cap.paragraphs[0]
            p_cap.alignment = PP_ALIGN.CENTER
            p_cap.text = caption
            p_cap.font.name = FONT_BODY
            p_cap.font.size = Pt(8.5)
            p_cap.font.italic = True
            p_cap.font.color.rgb = COLOR_TEXT_MUTED

        return pic

    def set_notes(slide, notes_text):
        notes_slide = slide.notes_slide
        tf = notes_slide.notes_text_frame
        tf.text = notes_text.strip()

    # =========================================================================
    # SLIDE 1: TITLE SLIDE
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    # Accent decorative gradient glow bar on the left
    bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(0.8), Inches(0.08), Inches(4.0))
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLOR_ACCENT_GREEN
    bar.line.fill.background()

    # Title & Subtitle block
    t_box = s1.shapes.add_textbox(Inches(0.9), Inches(0.8), Inches(5.8), Inches(2.2))
    tf1 = t_box.text_frame
    tf1.word_wrap = True
    tf1.margin_left = tf1.margin_right = tf1.margin_top = tf1.margin_bottom = 0

    p_badge = tf1.paragraphs[0]
    p_badge.text = "MCA PROJECT REVIEW  ·  PHASE 1"
    p_badge.font.name = FONT_BODY
    p_badge.font.size = Pt(11)
    p_badge.font.bold = True
    p_badge.font.color.rgb = COLOR_ACCENT_BLUE

    p_title = tf1.add_paragraph()
    p_title.text = "AgroConnect"
    p_title.font.name = FONT_TITLE
    p_title.font.size = Pt(46)
    p_title.font.bold = True
    p_title.font.color.rgb = COLOR_TEXT_MAIN
    p_title.space_before = Pt(8)

    p_sub = tf1.add_paragraph()
    p_sub.text = "AI-Assisted Agricultural Community, Crop Health Diagnostics & Tele-Consultation Ecosystem"
    p_sub.font.name = FONT_BODY
    p_sub.font.size = Pt(14)
    p_sub.font.color.rgb = COLOR_ACCENT_GREEN
    p_sub.space_before = Pt(6)

    # Student & Guide Details Card
    add_card(s1, Inches(0.9), Inches(3.2), Inches(5.5), Inches(1.6), bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)
    cred_box = s1.shapes.add_textbox(Inches(1.1), Inches(3.3), Inches(5.1), Inches(1.4))
    tf_c = cred_box.text_frame
    tf_c.word_wrap = True
    tf_c.margin_left = tf_c.margin_right = tf_c.margin_top = tf_c.margin_bottom = 0

    p_student = tf_c.paragraphs[0]
    p_student.text = "Prince Abraham Shaji"
    p_student.font.name = FONT_TITLE
    p_student.font.size = Pt(16)
    p_student.font.bold = True
    p_student.font.color.rgb = COLOR_TEXT_MAIN

    p_reg = tf_c.add_paragraph()
    p_reg.text = "Reg. No: AJC25MCA-2051   ·   MCA 2025–2027"
    p_reg.font.name = FONT_BODY
    p_reg.font.size = Pt(11.5)
    p_reg.font.color.rgb = COLOR_TEXT_MUTED
    p_reg.space_before = Pt(3)

    p_guide = tf_c.add_paragraph()
    p_guide.text = "Project Guide: Ms. Sona Maria Sebastian"
    p_guide.font.name = FONT_BODY
    p_guide.font.size = Pt(11.5)
    p_guide.font.bold = True
    p_guide.font.color.rgb = COLOR_ACCENT_BLUE
    p_guide.space_before = Pt(3)

    p_college = tf_c.add_paragraph()
    p_college.text = "Amal Jyothi College of Engineering (Autonomous), Kanjirappally"
    p_college.font.name = FONT_BODY
    p_college.font.size = Pt(10.5)
    p_college.font.color.rgb = COLOR_TEXT_DIM
    p_college.space_before = Pt(3)

    # Right side visual: Application Mobile Mockup
    add_image_safe(s1, "splash_screen.png", Inches(6.8), Inches(0.6), Inches(2.6), Inches(4.3),
                   caption="AgroConnect Mobile Native Client")

    set_notes(s1,
        "Good morning respected panel members and my project guide Ms. Sona Maria Sebastian. "
        "I am Prince Abraham Shaji, registration number AJC25MCA-2051. "
        "Today, I present AgroConnect — an AI-powered agricultural social platform and tele-consultation system "
        "engineered to bridge the gap between farmers, agronomists, and regional knowledge.")

    # =========================================================================
    # SLIDE 2: THE PROBLEM IN AGRICULTURE
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)
    add_header(s2, "Critical Challenges in Farmer Information Access", "Problem Analysis")
    add_footer(s2, 2)

    problems = [
        ("01", "Fragmented Agricultural Advice",
         "Farmers rely on scattered informal messaging groups and unverified forums. Information lacks scientific backing, local relevance, and accountability."),
        ("02", "Delayed Disease Identification",
         "Plant fungal infections and pest attacks spread rapidly across fields. Farmers struggle to identify pathology early, leading to severe yield destruction."),
        ("03", "Inaccessible Agronomy Experts",
         "Professional agricultural scientists and government officers are concentrated in urban research centers, making on-demand farm consultations difficult."),
        ("04", "Lack of Transparent Governance",
         "Traditional agricultural advisory services lack verifiable digital booking, audit histories, fair refund policies, and verified expert credentials.")
    ]

    card_w = Inches(4.2)
    card_h = Inches(1.7)
    coords = [
        (Inches(0.6), Inches(1.3)),
        (Inches(5.2), Inches(1.3)),
        (Inches(0.6), Inches(3.2)),
        (Inches(5.2), Inches(3.2))
    ]

    for (num, title, desc), (cx, cy) in zip(problems, coords):
        add_card(s2, cx, cy, card_w, card_h)
        # Accent number pill
        nb = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx + Inches(0.2), cy + Inches(0.2), Inches(0.45), Inches(0.35))
        nb.fill.solid()
        nb.fill.fore_color.rgb = COLOR_CARD_BORDER
        nb.line.fill.background()
        nb.text_frame.text = num
        nb.text_frame.paragraphs[0].font.name = FONT_BODY
        nb.text_frame.paragraphs[0].font.size = Pt(11)
        nb.text_frame.paragraphs[0].font.bold = True
        nb.text_frame.paragraphs[0].font.color.rgb = COLOR_ACCENT_AMBER if num in ["02", "04"] else COLOR_ACCENT_BLUE
        nb.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

        # Text
        tx = s2.shapes.add_textbox(cx + Inches(0.75), cy + Inches(0.15), card_w - Inches(0.9), card_h - Inches(0.25))
        tf = tx.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p_t = tf.paragraphs[0]
        p_t.text = title
        p_t.font.name = FONT_TITLE
        p_t.font.size = Pt(13)
        p_t.font.bold = True
        p_t.font.color.rgb = COLOR_TEXT_MAIN

        p_d = tf.add_paragraph()
        p_d.text = desc
        p_d.font.name = FONT_BODY
        p_d.font.size = Pt(10)
        p_d.font.color.rgb = COLOR_TEXT_MUTED
        p_d.space_before = Pt(4)

    set_notes(s2,
        "To understand why AgroConnect is needed, consider the daily reality of a farmer in Kerala. "
        "When a fungal target spot appears on tomato leaves or rubber tree leaf fall occurs, the farmer has four major problems: "
        "1) Unverified WhatsApp advice, 2) Delay in identifying plant diseases, 3) Inability to reach qualified agronomists, "
        "and 4) No accountable digital scheduling. This causes substantial economic crop loss.")

    # =========================================================================
    # SLIDE 3: WHY AN INTEGRATED SOLUTION IS NEEDED
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3)
    add_header(s3, "Bridging the Gap: Existing Tools vs. AgroConnect", "Market Gap")
    add_footer(s3, 3)

    cols = [
        ("General Social Platforms", "WhatsApp / Facebook Groups", COLOR_CARD_BORDER, [
            "❌ Unmoderated and noisy feeds",
            "❌ No verified agronomist certification",
            "❌ No structured consultation scheduling",
            "❌ Zero agricultural diagnostic intelligence",
            "❌ Location-blind content distribution"
        ]),
        ("Single-Purpose AI Apps", "Standalone Disease Scanners", COLOR_CARD_BORDER, [
            "⚠️ Isolated diagnosis without human followup",
            "❌ No direct agronomist booking mechanism",
            "❌ No community discussion or peer support",
            "❌ No regional district-specific prioritization",
            "❌ Requires multiple fragmented applications"
        ]),
        ("AgroConnect Ecosystem", "Unified Smart Platform", COLOR_ACCENT_GREEN, [
            "✅ District-first community knowledge feed",
            "✅ PEA AI instant agronomist assistant",
            "✅ Verified expert video consultation (Google Meet)",
            "✅ Automated escrow-safe cancellation rules",
            "✅ Admin-governed KYC accreditation"
        ])
    ]

    col_w = Inches(2.75)
    col_h = Inches(3.6)
    left_positions = [Inches(0.6), Inches(3.6), Inches(6.6)]

    for (name, sub, border_col, points), lx in zip(cols, left_positions):
        bg = RGBColor(18, 28, 40) if border_col == COLOR_ACCENT_GREEN else COLOR_CARD
        add_card(s3, lx, Inches(1.3), col_w, col_h, bg_color=bg, border_color=border_col)

        tx = s3.shapes.add_textbox(lx + Inches(0.18), Inches(1.45), col_w - Inches(0.36), col_h - Inches(0.3))
        tf = tx.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = name
        p1.font.name = FONT_TITLE
        p1.font.size = Pt(13)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_ACCENT_GREEN if border_col == COLOR_ACCENT_GREEN else COLOR_TEXT_MAIN

        p2 = tf.add_paragraph()
        p2.text = sub
        p2.font.name = FONT_BODY
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = COLOR_TEXT_DIM
        p2.space_before = Pt(2)

        for pt in points:
            p = tf.add_paragraph()
            p.text = pt
            p.font.name = FONT_BODY
            p.font.size = Pt(9.5)
            p.font.color.rgb = COLOR_TEXT_MAIN if pt.startswith("✅") else COLOR_TEXT_MUTED
            p.space_before = Pt(8)

    set_notes(s3,
        "Why can't farmers simply use existing tools? "
        "General social networks are filled with noise and unverified advice. "
        "Standalone AI scanning apps give a probability score but provide no verified human agronomist to confirm it or prescribe treatments. "
        "AgroConnect uniquely brings peer community, instant AI triage, and real-time agronomist video appointments into one unified, governed application.")

    # =========================================================================
    # SLIDE 4: INTRODUCING AGROCONNECT
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4)
    add_header(s4, "AgroConnect: Architecture & Core Pillars", "System Overview")
    add_footer(s4, 4)

    # Left overview text & 4 pillars
    left_w = Inches(4.8)
    tx = s4.shapes.add_textbox(Inches(0.6), Inches(1.3), left_w, Inches(1.2))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = "A purpose-built agricultural ecosystem designed to empower farmers with localized intelligence, rapid plant disease guidance, and direct consultation with certified agronomists."
    p.font.name = FONT_BODY
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_TEXT_MUTED

    pillars = [
        ("District-First Community", "Feeds prioritized by farmer's district (Kannur, Kottayam, Pathanamthitta, Idukki).", COLOR_ACCENT_BLUE),
        ("PEA AI Smart Assistant", "Instant agronomic intelligence on pest cycles, vermicompost, and disease symptoms.", COLOR_ACCENT_GREEN),
        ("Catch Up Tele-Consultations", "Interactive calendar booking with Google Meet video rooms and automated refund logic.", COLOR_ACCENT_AMBER),
        ("Governance & Verification", "Admin accreditation verifying expert degrees, CV PDFs, and broadcast oversight.", COLOR_ACCENT_BLUE)
    ]

    p_top = Inches(2.3)
    for title, desc, col in pillars:
        add_card(s4, Inches(0.6), p_top, left_w, Inches(0.62), bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)
        # indicator
        ind = s4.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), p_top, Inches(0.06), Inches(0.62))
        ind.fill.solid()
        ind.fill.fore_color.rgb = col
        ind.line.fill.background()

        ptx = s4.shapes.add_textbox(Inches(0.78), p_top + Inches(0.06), left_w - Inches(0.28), Inches(0.5))
        ptf = ptx.text_frame
        ptf.word_wrap = True
        ptf.margin_left = ptf.margin_right = ptf.margin_top = ptf.margin_bottom = 0
        pp1 = ptf.paragraphs[0]
        pp1.text = title
        pp1.font.name = FONT_TITLE
        pp1.font.size = Pt(11)
        pp1.font.bold = True
        pp1.font.color.rgb = COLOR_TEXT_MAIN

        pp2 = ptf.add_paragraph()
        pp2.text = desc
        pp2.font.name = FONT_BODY
        pp2.font.size = Pt(9.0)
        pp2.font.color.rgb = COLOR_TEXT_MUTED
        pp2.space_before = Pt(1)

        p_top += Inches(0.68)

    # Right side Screenshot
    add_image_safe(s4, "farmer_feed.png", Inches(5.8), Inches(1.2), Inches(3.6), Inches(3.8),
                   caption="AgroConnect Mobile Feed Interface")

    set_notes(s4,
        "Here we introduce AgroConnect. Built as an Android mobile app and web administration dashboard, "
        "it is structured around four primary pillars: 1) District-prioritized community feeds, "
        "2) PEA, our AI agricultural assistant, 3) Catch Up expert consultation scheduling, and "
        "4) An administrative oversight engine ensuring platform credibility.")

    # =========================================================================
    # SLIDE 5: USER ROLES & PERMISSIONS
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5)
    add_header(s5, "Role-Based Ecosystem & Permission Matrix", "User Architecture")
    add_footer(s5, 5)

    roles = [
        ("Farmer (User)", "Primary Agricultural Participant", COLOR_ACCENT_GREEN, [
            "• Register with phone, district & Google OAuth",
            "• Publish photo & video crop field updates",
            "• Query PEA AI for instant plant pathology advice",
            "• Book verified agronomist consultation slots",
            "• Chat directly or submit connection requests"
        ]),
        ("Agricultural Expert", "Verified Agronomist / Scientist", COLOR_ACCENT_BLUE, [
            "• Undergo KYC review (degree & PDF CV submission)",
            "• Set custom consultation fees (e.g. ₹500/slot)",
            "• Configure date & 30-minute availability slots",
            "• Provide Google Meet consultation links",
            "• Request platform broadcast announcements"
        ]),
        ("Administrator", "Platform Governance & Trust", COLOR_ACCENT_AMBER, [
            "• Review & approve/reject expert KYC applications",
            "• Inspect uploaded CV resumes securely via storage",
            "• Audit completed & cancelled consultation meetings",
            "• Issue full/partial refunds with written audit logs",
            "• Publish system-wide broadcast advisories"
        ])
    ]

    r_w = Inches(2.75)
    r_h = Inches(3.6)
    r_positions = [Inches(0.6), Inches(3.6), Inches(6.6)]

    for (r_name, r_sub, r_col, r_perms), rx in zip(roles, r_positions):
        add_card(s5, rx, Inches(1.3), r_w, r_h, bg_color=COLOR_CARD, border_color=r_col)

        # Header bar inside card
        hbar = s5.shapes.add_shape(MSO_SHAPE.RECTANGLE, rx, Inches(1.3), r_w, Inches(0.06))
        hbar.fill.solid()
        hbar.fill.fore_color.rgb = r_col
        hbar.line.fill.background()

        rtx = s5.shapes.add_textbox(rx + Inches(0.18), Inches(1.45), r_w - Inches(0.36), r_h - Inches(0.3))
        rtf = rtx.text_frame
        rtf.word_wrap = True
        rtf.margin_left = rtf.margin_right = rtf.margin_top = rtf.margin_bottom = 0

        rp1 = rtf.paragraphs[0]
        rp1.text = r_name
        rp1.font.name = FONT_TITLE
        rp1.font.size = Pt(13.5)
        rp1.font.bold = True
        rp1.font.color.rgb = COLOR_TEXT_MAIN

        rp2 = rtf.add_paragraph()
        rp2.text = r_sub
        rp2.font.name = FONT_BODY
        rp2.font.size = Pt(9.0)
        rp2.font.color.rgb = r_col
        rp2.space_before = Pt(2)

        for perm in r_perms:
            p = rtf.add_paragraph()
            p.text = perm
            p.font.name = FONT_BODY
            p.font.size = Pt(9.5)
            p.font.color.rgb = COLOR_TEXT_MUTED
            p.space_before = Pt(8)

    set_notes(s5,
        "AgroConnect implements strict Role-Based Access Control enforced at the database level via PostgreSQL Row Level Security. "
        "Farmers interact with peers, consult PEA AI, and book experts. "
        "Experts manage their availability calendar, charge transparent fees, and join video calls. "
        "Administrators supervise the system, verify agronomist degrees, and handle cancellations and dispute refunds.")

    # =========================================================================
    # SLIDE 6: FARMER ONBOARDING & DISTRICT PROFILES
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6)
    add_header(s6, "Farmer Onboarding & Regional Personalization", "Authentication & Setup")
    add_footer(s6, 6)

    # Left text explanation
    tx = s6.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s6 = [
        ("Multiple Authentication Options", "Supports secure Email/Password authentication and Google OAuth 2.0 with native Android deep linking."),
        ("Kerala District Localization", "Tailored specifically for Kerala agriculture. Farmers select from four launch agricultural districts: Kannur, Pathanamthitta, Idukki, and Kottayam."),
        ("Privacy-First Approach", "Eliminates intrusive background GPS tracking. Regional context is established strictly through user-selected district preferences."),
        ("Profile Management", "Displays farmer bio, connection count, and active posts while enabling straightforward profile editing.")
    ]

    for i, (head, body) in enumerate(points_s6):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = f"{i+1}. {head}"
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_GREEN
        if i > 0:
            p_h.space_before = Pt(12)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(2)

    # Right side 2 Screenshots: Login & Profile
    add_image_safe(s6, "login_screen.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Login / Sign In")
    add_image_safe(s6, "farmer_profile.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Farmer Profile")

    set_notes(s6,
        "Here we see the onboarding process. Farmers can register using standard credentials or Google OAuth. "
        "Crucially, instead of invasive continuous GPS tracking, we let farmers choose their district among four initial regions in Kerala: "
        "Kannur, Pathanamthitta, Idukki, and Kottayam. This district selection drives our smart localized recommendation engine.")

    # =========================================================================
    # SLIDE 7: DISTRICT-PRIORITIZED COMMUNITY FEED
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7)
    add_header(s7, "District-First Feed Architecture", "Community Feed")
    add_footer(s7, 7)

    # Left text explanation
    tx = s7.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(5.2), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    feed_steps = [
        ("Hyper-Local Context Priority", "A farmer from Kottayam immediately sees agricultural advisories and pest observations from Kottayam first, ensuring immediate relevance to their climate."),
        ("PostgreSQL Server-Side Sorting", "Implemented via a specialized database stored procedure (RPC) rather than slow client filtering, sorting matching district records ahead of statewide posts."),
        ("Stable Keyset Pagination", "Eliminates duplicate items or skipped posts across infinite scrolling, preserving feed performance even over 2G/3G rural networks."),
        ("Peer & Expert Collaboration", "Farmers post field queries, and verified agronomists answer directly with a distinctive green verified badge.")
    ]

    for i, (head, body) in enumerate(feed_steps):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_BLUE
        if i > 0:
            p_h.space_before = Pt(12)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side Screenshot: Feed
    add_image_safe(s7, "farmer_feed.png", Inches(6.1), Inches(1.2), Inches(3.3), Inches(3.8),
                   caption="District-Prioritized Feed on Android")

    set_notes(s7,
        "Slide 7 shows our district-first feed algorithm in action. "
        "Agricultural advice is climate-dependent — weather in Idukki is vastly different from Kannur. "
        "Our database query automatically prioritizes posts authored within the farmer's registered district, "
        "ensuring that immediate disease warnings and local market shifts appear right at the top.")

    # =========================================================================
    # SLIDE 8: MULTIMEDIA POSTS & FARMER COLLABORATION
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8)
    add_header(s8, "Multimedia Posts & Field Observations", "Social Interaction")
    add_footer(s8, 8)

    tx = s8.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(5.2), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    features_s8 = [
        ("Video & Image Field Uploads", "Farmers can record video walkthroughs of crops showing pest movement, or upload high-resolution photos of damaged foliage directly into Supabase Storage."),
        ("Interactive Engagement", "Community likes, bookmarks, and threaded discussions allow farmers across districts to share pest control tips and cultivation experiences."),
        ("Safe Storage Architecture", "Media assets reside in isolated Supabase storage buckets (`post-images`, `post-videos`). Public directory listing is strictly blocked to maintain data integrity."),
        ("Instant Agronomist Feedback", "Verified agronomists monitor local feeds and provide verified guidance on farmer posts.")
    ]

    for i, (head, body) in enumerate(features_s8):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_GREEN
        if i > 0:
            p_h.space_before = Pt(12)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side Screenshot: Video Post
    add_image_safe(s8, "feed_video_post.png", Inches(6.1), Inches(1.2), Inches(3.3), Inches(3.8),
                   caption="Crop Video Observation Card")

    set_notes(s8,
        "Static photos often fail to capture agricultural problems like insect infestations. "
        "AgroConnect supports embedded video walkthroughs directly inside feed cards, as shown on the right. "
        "Storage policies prevent anonymous listing, and all media is streamed efficiently over standard HTML5 video.")

    # =========================================================================
    # SLIDE 9: PEA AI ASSISTANT
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_background(s9)
    add_header(s9, "PEA: AI-Powered Agricultural Assistant", "Intelligent Assistance")
    add_footer(s9, 9)

    # Left explanation
    tx = s9.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.6), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s9 = [
        ("Instant First-Line Agricultural Support", "Accessible 24/7 directly from the app header. Answers crop troubleshooting questions in real time without human wait delays."),
        ("Structured Domain Knowledge", "Built on curated agronomic rules covering organic compost, biological pest control, soil fertility, and crop rotation cycles."),
        ("One-Tap Prompt Suggestions", "Offers quick-start prompt chips for common regional queries such as 'Identify Tomato Early Blight' or 'How to make Vermicompost'."),
        ("Markdown Formatting", "Renders structured agronomic recommendations with bullet points, bold pathogen names, and clear step-by-step instructions.")
    ]

    for i, (head, body) in enumerate(points_s9):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_BLUE
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side: Simulated Card of PEA AI Interface
    card_right = add_card(s9, Inches(5.5), Inches(1.3), Inches(3.9), Inches(3.6), bg_color=RGBColor(18, 26, 36))
    ctx = s9.shapes.add_textbox(Inches(5.7), Inches(1.45), Inches(3.5), Inches(3.3))
    ctf = ctx.text_frame
    ctf.word_wrap = True
    ctf.margin_left = ctf.margin_right = ctf.margin_top = ctf.margin_bottom = 0

    cp1 = ctf.paragraphs[0]
    cp1.text = "🌱 PEA Assistant Chat Preview"
    cp1.font.name = FONT_TITLE
    cp1.font.size = Pt(12)
    cp1.font.bold = True
    cp1.font.color.rgb = COLOR_ACCENT_GREEN

    dialogue = [
        ("PEA Assistant", "Hello! I am PEA, your personal Agro Connect AI Assistant. What would you like to troubleshoot today?"),
        ("Farmer", "How do I make Vermicompost at home?"),
        ("PEA Assistant", "### Vermicomposting Setup 🪱\n1. Drill breathing holes in a 50L bin.\n2. Add wet cardboard/coco-coir bedding.\n3. Introduce Red Wiggler worms.\n4. Feed vegetable scraps (avoid citrus & dairy).\n5. Harvest worm castings after 2-3 months.")
    ]

    for sender, msg in dialogue:
        ps = ctf.add_paragraph()
        ps.text = sender + ":"
        ps.font.name = FONT_BODY
        ps.font.size = Pt(9.5)
        ps.font.bold = True
        ps.font.color.rgb = COLOR_ACCENT_BLUE if sender == "Farmer" else COLOR_ACCENT_GREEN
        ps.space_before = Pt(6)

        pm = ctf.add_paragraph()
        pm.text = msg
        pm.font.name = FONT_BODY
        pm.font.size = Pt(8.5)
        pm.font.color.rgb = COLOR_TEXT_MAIN
        pm.space_before = Pt(1)

    set_notes(s9,
        "Slide 9 introduces PEA, our interactive AI farming assistant. "
        "Accessible with one tap from the header, PEA provides immediate first-line answers. "
        "Farmers who may not know technical pathogen names can ask in plain language, "
        "and PEA returns structured advice on organic farming, biological treatments, and soil health.")

    # =========================================================================
    # SLIDE 10: CROP DISEASE TRIAGE
    # =========================================================================
    s10 = prs.slides.add_slide(blank_layout)
    set_slide_background(s10)
    add_header(s10, "Plant Pathology & Disease Triage Workflow", "Crop Health Diagnostics")
    add_footer(s10, 10)

    # 4-stage horizontal pipeline
    stages = [
        ("1. Field Symptom", "Farmer observes target spot lesions or leaf yellowing on crop foliage.", COLOR_ACCENT_BLUE),
        ("2. AI Pathology Triage", "PEA matches symptom patterns to known fungal pathogens (e.g. Alternaria solani).", COLOR_ACCENT_GREEN),
        ("3. Organic Treatment", "Prescribes biological controls (copper fungicides, Bacillus subtilis, mulch).", COLOR_ACCENT_AMBER),
        ("4. Expert Verification", "Farmer books a tele-consultation with a plant pathologist if damage persists.", COLOR_ACCENT_BLUE)
    ]

    pipe_w = Inches(2.05)
    pipe_h = Inches(1.6)
    pipe_x = [Inches(0.6), Inches(2.85), Inches(5.1), Inches(7.35)]

    for (s_title, s_desc, s_col), px in zip(stages, pipe_x):
        add_card(s10, px, Inches(1.3), pipe_w, pipe_h, bg_color=COLOR_CARD, border_color=s_col)

        stx = s10.shapes.add_textbox(px + Inches(0.12), Inches(1.4), pipe_w - Inches(0.24), pipe_h - Inches(0.2))
        stf = stx.text_frame
        stf.word_wrap = True
        stf.margin_left = stf.margin_right = stf.margin_top = stf.margin_bottom = 0

        sp1 = stf.paragraphs[0]
        sp1.text = s_title
        sp1.font.name = FONT_TITLE
        sp1.font.size = Pt(11)
        sp1.font.bold = True
        sp1.font.color.rgb = s_col

        sp2 = stf.add_paragraph()
        sp2.text = s_desc
        sp2.font.name = FONT_BODY
        sp2.font.size = Pt(8.5)
        sp2.font.color.rgb = COLOR_TEXT_MUTED
        sp2.space_before = Pt(4)

    # Lower section: Case study card
    add_card(s10, Inches(0.6), Inches(3.1), Inches(8.8), Inches(1.8), bg_color=RGBColor(16, 24, 34), border_color=COLOR_CARD_BORDER)
    cs_tx = s10.shapes.add_textbox(Inches(0.8), Inches(3.2), Inches(8.4), Inches(1.6))
    cstf = cs_tx.text_frame
    cstf.word_wrap = True
    cstf.margin_left = cstf.margin_right = cstf.margin_top = cstf.margin_bottom = 0

    csp1 = cstf.paragraphs[0]
    csp1.text = "CASE STUDY: Tomato Early Blight (Alternaria solani) Diagnostic Response"
    csp1.font.name = FONT_TITLE
    csp1.font.size = Pt(12)
    csp1.font.bold = True
    csp1.font.color.rgb = COLOR_ACCENT_GREEN

    points_cs = [
        "• Symptoms Identified: Dark concentric rings on older lower leaves, surrounding yellow halo, progressive defoliation.",
        "• Organic Remediation: Morning spray of bio-fungicides (Bacillus subtilis), lower foliage pruning, organic straw mulching.",
        "• Cultural Prevention: Implement strict 3-year crop rotation avoiding Solanaceae family plants (potatoes, eggplants).",
        "• Safety Protocol: The system explicitly instructs the farmer to escalate to verified agronomists for severe bacterial wilts."
    ]

    for pt in points_cs:
        p = cstf.add_paragraph()
        p.text = pt
        p.font.name = FONT_BODY
        p.font.size = Pt(9.5)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_before = Pt(3)

    set_notes(s10,
        "Slide 10 details our plant pathology triage workflow. "
        "Rather than functioning as an unguided black-box diagnosis, AgroConnect combines symptom matching "
        "with concrete agronomic recommendations (biological controls and 3-year crop rotation). "
        "If a condition is severe, it smoothly directs the farmer to human agronomist consultations.")

    # =========================================================================
    # SLIDE 11: EXPERT DISCOVERY & CONSULTATION BOOKING
    # =========================================================================
    s11 = prs.slides.add_slide(blank_layout)
    set_slide_background(s11)
    add_header(s11, "Agronomist Discovery & Calendar Scheduling", "Expert Catch Up")
    add_footer(s11, 11)

    tx = s11.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s11 = [
        ("Verified Agronomist Profiles", "Farmers browse certified experts with ratings, specializations (soil fertility, plant pathology), and experience years."),
        ("Transparent Fee Schedules", "Each agronomist lists their exact consultation fee (e.g. ₹500.00). No hidden costs or unverified surcharges."),
        ("Dynamic Slot Reservation", "Experts configure available consultation dates and 30-minute time intervals. PostgreSQL database locks prevent double booking."),
        ("Issue Description Pre-Submission", "Farmers enter a summary of their crop issue prior to booking, allowing the agronomist to prepare before the consultation.")
    ]

    for i, (head, body) in enumerate(points_s11):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_BLUE
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side 2 Screenshots: Expert List & Slot Picker
    add_image_safe(s11, "book_expert_list.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Verified Experts List")
    add_image_safe(s11, "catchup_slots.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Available Slots")

    set_notes(s11,
        "In Slide 11, we explore our 'Catch Up' expert scheduling module. "
        "Farmers browse certified agronomists by district, view transparent fees, and select calendar dates. "
        "When an appointment slot is picked, PostgreSQL atomic transactions guarantee that no two farmers can book the same slot simultaneously.")

    # =========================================================================
    # SLIDE 12: DEMO CHECKOUT & CANCELLATION ECONOMICS
    # =========================================================================
    s12 = prs.slides.add_slide(blank_layout)
    set_slide_background(s12)
    add_header(s12, "Demonstration Checkout & Cancellation Policies", "Booking Economics")
    add_footer(s12, 12)

    tx = s12.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s12 = [
        ("Simulated Escrow Checkout", "A demonstration payment checkout simulates transaction workflows without exposing farmers to real financial risk during prototype testing."),
        ("The 14-Hour Cancellation Threshold", "Farmers cancelling ≥14 hours before slot start receive an automatic 100% full refund."),
        ("Fair Expert Compensation (<14 Hours)", "Cancellations inside 14 hours allocate 50% to the expert for reserved time, 2% platform fee, and 48% refunded to the farmer."),
        ("Unconditional Expert / No-Show Refunds", "If an expert cancels at any time or fails to provide a meeting link within 5 minutes of start, the farmer receives an immediate 100% refund.")
    ]

    for i, (head, body) in enumerate(points_s12):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(11.5)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_GREEN
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side 2 Screenshots: Payment processing & Cancel Terms
    add_image_safe(s12, "payment_processing.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Demo Payment Simulation")
    add_image_safe(s12, "cancel_terms.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Server Refund Terms")

    set_notes(s12,
        "Fairness and financial trust are vital for rural adoption. "
        "Slide 12 displays our booking cancellation logic, fully executed on the PostgreSQL server. "
        "We implement a strict 14-hour threshold: cancelling early gives a 100% refund. "
        "Late cancellations give 50% to the expert for reserved time. If an expert no-shows, the farmer is refunded 100% automatically.")

    # =========================================================================
    # SLIDE 13: TELE-CONSULTATIONS VIA GOOGLE MEET
    # =========================================================================
    s13 = prs.slides.add_slide(blank_layout)
    set_slide_background(s13)
    add_header(s13, "Real-Time Tele-Consultations via Google Meet", "Video Consultation")
    add_footer(s13, 13)

    tx = s13.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s13 = [
        ("Native Google Meet Integration", "Eliminates third-party video licensing costs. Experts paste an authenticated Google Meet link validated server-side."),
        ("Automated Join Window Enforcement", "The 'Join Meeting' button unlocks 5 minutes before scheduled start time and stays active for the duration of the slot."),
        ("No-Show Protection", "If an agronomist fails to provide a meeting link within 5 minutes past start, the system flags a no-show and triggers an automated refund."),
        ("Post-Consultation Reviews", "Following completed sessions, farmers submit 1-to-5 star ratings and written reviews, building trusted regional reputations.")
    ]

    for i, (head, body) in enumerate(points_s13):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_BLUE
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side 2 Screenshots: Join Enabled & Meeting Room
    add_image_safe(s13, "join_enabled.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Join Window Enabled")
    add_image_safe(s13, "meeting_room.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Google Meet Room")

    set_notes(s13,
        "Rather than relying on proprietary embedded videoSDKs that strain rural bandwidth and inflate hosting bills, "
        "AgroConnect integrates standard Google Meet links. "
        "The server enforces join timing: the link is concealed until 5 minutes before the call, "
        "opening directly in the phone's native Google Meet application.")

    # =========================================================================
    # SLIDE 14: DIRECT MESSAGING & REQUESTS
    # =========================================================================
    s14 = prs.slides.add_slide(blank_layout)
    set_slide_background(s14)
    add_header(s14, "Private Messaging & Connection Request Workflow", "Direct Communication")
    add_footer(s14, 14)

    tx = s14.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s14 = [
        ("Two-Tier Messaging Protection", "Prevents unsolicited spam. First messages from unconnected users appear in a distinct 'Message Requests' inbox."),
        ("Visual Blue Notification Dot", "The request icon illuminates a blue badge only when pending requests exist, disappearing once reviewed."),
        ("One-Click Accept or Decline", "Recipients can Accept (moving the chat to the main inbox) or Decline (silently dismissing without alerting the sender)."),
        ("RPC-Governed Table Security", "Client apps never write directly to messaging tables. All text passes through PostgreSQL stored procedures that sanitize input and enforce length limits.")
    ]

    for i, (head, body) in enumerate(points_s14):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_GREEN
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side 2 Screenshots: Chat Sent & Request Accepted
    add_image_safe(s14, "chat_sent.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Active Consultation Chat")
    add_image_safe(s14, "request_accepted.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Request Accepted")

    set_notes(s14,
        "In Slide 14, we examine our messaging architecture. "
        "To protect agronomists and farmers from unsolicited harassment, we enforce a two-tier message request system. "
        "Unconnected users land in requests. Once accepted, they move smoothly into the main conversation list. "
        "All messages are handled via PostgreSQL RPCs, preventing direct table manipulation.")

    # =========================================================================
    # SLIDE 15: EXPERT KYC & CREDENTIAL ONBOARDING
    # =========================================================================
    s15 = prs.slides.add_slide(blank_layout)
    set_slide_background(s15)
    add_header(s15, "Agronomist Accreditation & KYC Verification", "Expert Onboarding")
    add_footer(s15, 15)

    tx = s15.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s15 = [
        ("Rigorous Accreditation Flow", "Users applying to become verified experts must submit their university degree (e.g. B.Sc Agriculture), specialization, and experience details."),
        ("Mandatory Resume / CV PDF Upload", "Applicants upload a valid PDF CV directly into an isolated Supabase storage bucket (`expert-cvs`)."),
        ("Storage Access Control", "CV resumes are strictly confidential. Anonymous and unauthenticated access is rejected by RLS; only authorized administrators can view documents."),
        ("Atomic Role Elevation", "Upon admin approval, the system transitions `profiles.role` to 'Expert' and creates the `experts` record in a single database transaction.")
    ]

    for i, (head, body) in enumerate(points_s15):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_AMBER
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side 2 Screenshots: KYC Step & Expert Catchup
    add_image_safe(s15, "kyc_cv_uploaded.png", Inches(5.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Expert CV Submission")
    add_image_safe(s15, "expert_catchup.png", Inches(7.6), Inches(1.3), Inches(1.85), Inches(3.6), caption="Approved Expert Console")

    set_notes(s15,
        "A critical differentiator for AgroConnect is trust. Anyone can claim to be an agronomist on social media. "
        "On AgroConnect, an expert must upload their educational degree and professional CV in PDF format. "
        "The CV bucket is private; only verified administrators can view it, preventing fake agronomists from misleading farmers.")

    # =========================================================================
    # SLIDE 16: ADMIN DASHBOARD & GOVERNANCE
    # =========================================================================
    s16 = prs.slides.add_slide(blank_layout)
    set_slide_background(s16)
    add_header(s16, "Centralized Administration & Platform Governance", "Admin Operations")
    add_footer(s16, 16)

    tx = s16.shapes.add_textbox(Inches(0.6), Inches(1.3), Inches(4.8), Inches(3.6))
    tf = tx.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    points_s16 = [
        ("Dedicated Web Administration Portal", "Hosted independently on Render Static Cloud, providing administrators full oversight without cluttering the mobile app."),
        ("KYC Application Queue", "Admins review pending agronomist applications, inspect PDF CVs, and approve or reject submissions with reason notes."),
        ("Consultation Session Audits", "Complete ledger of all booked, completed, and cancelled meetings with full refund tracking and commission accounting."),
        ("Platform-Wide Broadcast Alerts", "Admins broadcast critical regional warnings (e.g. monsoon alerts, locust swarms) to all farmers or targeted districts.")
    ]

    for i, (head, body) in enumerate(points_s16):
        p_h = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p_h.text = head
        p_h.font.name = FONT_TITLE
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = COLOR_ACCENT_BLUE
        if i > 0:
            p_h.space_before = Pt(11)

        p_b = tf.add_paragraph()
        p_b.text = body
        p_b.font.name = FONT_BODY
        p_b.font.size = Pt(9.5)
        p_b.font.color.rgb = COLOR_TEXT_MUTED
        p_b.space_before = Pt(3)

    # Right side Screenshot: Admin Dashboard Desktop
    add_image_safe(s16, "admin_dashboard_login.png", Inches(5.6), Inches(1.3), Inches(3.8), Inches(3.6),
                   caption="Admin Web Dashboard Interface")

    set_notes(s16,
        "Slide 16 presents the Admin Dashboard. Built with React and Tailwind CSS and hosted on Render, "
        "it allows administrators to inspect user accounts, process expert applications, "
        "audit consultations, and broadcast emergency agricultural announcements across districts.")

    # =========================================================================
    # SLIDE 17: END-TO-END APPLICATION WORKFLOW
    # =========================================================================
    s17 = prs.slides.add_slide(blank_layout)
    set_slide_background(s17)
    add_header(s17, "Integrated User Journey & Operational Workflow", "End-to-End Workflow")
    add_footer(s17, 17)

    wf_steps = [
        ("Step 1: Onboard & Localize", "Farmer registers via Email or Google OAuth and picks their Kerala district (Kannur, Pathanamthitta, Idukki, Kottayam).", COLOR_ACCENT_BLUE),
        ("Step 2: Community & AI Triage", "Farmer reviews local district feed for crop updates; queries PEA AI for immediate pest and soil troubleshooting.", COLOR_ACCENT_GREEN),
        ("Step 3: Agronomist Booking", "For persistent crop diseases, farmer selects a verified agronomist, reviews fee (₹500), and reserves a calendar slot.", COLOR_ACCENT_AMBER),
        ("Step 4: Secure Video Session", "Join button activates 5 minutes before time; farmer and agronomist conduct video call on Google Meet.", COLOR_ACCENT_BLUE),
        ("Step 5: Completion & Review", "Agronomist marks consultation complete; farmer posts feedback rating; automated ledger updates platform audit logs.", COLOR_ACCENT_GREEN)
    ]

    wf_w = Inches(8.8)
    wf_h = Inches(0.65)
    wf_top = Inches(1.35)

    for i, (title, desc, col) in enumerate(wf_steps):
        add_card(s17, Inches(0.6), wf_top, wf_w, wf_h, bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)

        # Number pill
        np = s17.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), wf_top, Inches(0.65), wf_h)
        np.fill.solid()
        np.fill.fore_color.rgb = col
        np.line.fill.background()
        np.text_frame.text = f"0{i+1}"
        np.text_frame.paragraphs[0].font.name = FONT_BODY
        np.text_frame.paragraphs[0].font.size = Pt(12)
        np.text_frame.paragraphs[0].font.bold = True
        np.text_frame.paragraphs[0].font.color.rgb = COLOR_BG
        np.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

        wtx = s17.shapes.add_textbox(Inches(1.4), wf_top + Inches(0.06), wf_w - Inches(0.9), wf_h - Inches(0.12))
        wtf = wtx.text_frame
        wtf.word_wrap = True
        wtf.margin_left = wtf.margin_right = wtf.margin_top = wtf.margin_bottom = 0

        wp1 = wtf.paragraphs[0]
        wp1.text = title
        wp1.font.name = FONT_TITLE
        wp1.font.size = Pt(11.5)
        wp1.font.bold = True
        wp1.font.color.rgb = COLOR_TEXT_MAIN

        wp2 = wtf.add_paragraph()
        wp2.text = desc
        wp2.font.name = FONT_BODY
        wp2.font.size = Pt(9.0)
        wp2.font.color.rgb = COLOR_TEXT_MUTED
        wp2.space_before = Pt(1)

        wf_top += Inches(0.72)

    set_notes(s17,
        "Slide 17 illustrates how all modules form a single connected journey: "
        "A farmer registers and sets their district; browses local advice and consults PEA AI; "
        "if an issue requires human diagnosis, books an agronomist; meets securely on Google Meet; "
        "and finishes with transparent ratings and automated transaction auditing.")

    # =========================================================================
    # SLIDE 18: SYSTEM ARCHITECTURE & TECH STACK
    # =========================================================================
    s18 = prs.slides.add_slide(blank_layout)
    set_slide_background(s18)
    add_header(s18, "Full-Stack System Architecture & Technology Stack", "Technical Architecture")
    add_footer(s18, 18)

    tiers = [
        ("Client Tier (Mobile & Web)", COLOR_ACCENT_GREEN, [
            "• Mobile Native: Apache Cordova / Ionic Capacitor targeting Android SDK 36",
            "• Frontend Engine: React 18 SPA with Vite bundler & Tailwind CSS",
            "• Design System: Custom dark mode with Material Symbols and responsive touch UI",
            "• Performance: Optimized chunking, local asset caching, offline splash handling"
        ]),
        ("Cloud & Backend Tier", COLOR_ACCENT_BLUE, [
            "• Admin Hosting: Render Cloud Static Site with automatic SPA fallback (404.html)",
            "• Backend Platform: Supabase Cloud PaaS (PostgREST API, Realtime WebSockets)",
            "• Authentication: Supabase GoTrue API (Email/Password & Google OAuth 2.0)",
            "• Media Storage: Supabase Cloud Storage (post-images, post-videos, expert-cvs)"
        ]),
        ("Data & Security Tier (PostgreSQL)", COLOR_ACCENT_AMBER, [
            "• Database Engine: PostgreSQL hosted on Supabase Cloud (`mgreapakfchcxcrauheq`)",
            "• Logic Enforcement: PL/pgSQL stored procedures (`SECURITY DEFINER` pinned path)",
            "• Access Control: Row Level Security (RLS) policies on every table with deny-by-default",
            "• Automation: pg_cron scheduled lifecycle tasks for meeting closure & reminders"
        ])
    ]

    t_w = Inches(8.8)
    t_h = Inches(1.1)
    t_top = Inches(1.35)

    for (t_name, t_col, t_bullets) in tiers:
        add_card(s18, Inches(0.6), t_top, t_w, t_h, bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)

        bar = s18.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), t_top, Inches(0.08), t_h)
        bar.fill.solid()
        bar.fill.fore_color.rgb = t_col
        bar.line.fill.background()

        ttx = s18.shapes.add_textbox(Inches(0.85), t_top + Inches(0.08), t_w - Inches(0.35), t_h - Inches(0.16))
        ttf = ttx.text_frame
        ttf.word_wrap = True
        ttf.margin_left = ttf.margin_right = ttf.margin_top = ttf.margin_bottom = 0

        tp1 = ttf.paragraphs[0]
        tp1.text = t_name
        tp1.font.name = FONT_TITLE
        tp1.font.size = Pt(12)
        tp1.font.bold = True
        tp1.font.color.rgb = t_col

        for b in t_bullets:
            p = ttf.add_paragraph()
            p.text = b
            p.font.name = FONT_BODY
            p.font.size = Pt(9.0)
            p.font.color.rgb = COLOR_TEXT_MUTED
            p.space_before = Pt(1)

        t_top += Inches(1.22)

    set_notes(s18,
        "Here is the complete architectural stack. "
        "The client tier uses React 18 packaged with Capacitor into an Android APK. "
        "The web admin dashboard runs on Render Static Cloud. "
        "The backend is powered by Supabase with PostgreSQL, enforcing all business logic via PL/pgSQL stored procedures and Row Level Security.")

    # =========================================================================
    # SLIDE 19: IMPLEMENTATION & VERIFICATION
    # =========================================================================
    s19 = prs.slides.add_slide(blank_layout)
    set_slide_background(s19)
    add_header(s19, "Testing, Verification & Deployment Results", "Quality Assurance")
    add_footer(s19, 19)

    test_cards = [
        ("Automated Test Suite (PGlite)", "115 Tests Passed · 0 Failures", COLOR_ACCENT_GREEN, [
            "• Unit & Database Integration: Verified across 37 test suites using in-memory PostgreSQL (PGlite).",
            "• Consultation RPC Verification: Tested booking atomicity, reminder delivery, and no-show processing.",
            "• Financial Refund Reconciliations: Full 14-hour boundary test verifying exact percentage distributions.",
            "• Role Security Protections: Privilege escalation attacks, self-promotion, and anonymous reads blocked."
        ]),
        ("End-to-End Browser Tests (Playwright)", "3 E2E Suites Passed · Chrome", COLOR_ACCENT_BLUE, [
            "• Negative Authentication Checks: Verified invalid credentials return user-friendly errors without API key failure.",
            "• Publishable Key Hardening: Eliminated legacy JWT 'Invalid API key' failure on production Supabase endpoints.",
            "• Deep-Link Routing: Tested SPA 404 fallback ensuring direct route refreshes (e.g. /users) load cleanly."
        ]),
        ("Physical Device Deployment (Android 16)", "Verified on Realme/Oppo AIN065", COLOR_ACCENT_AMBER, [
            "• Package Identity: `com.agroconnect.app` · Version 1.1 (versionCode 2) built with JDK 17 & Gradle 9.2.1.",
            "• Live On-Device Execution: Streamed install via ADB; zero crashes or unhandled exceptions in Android logcat.",
            "• Real Data Verification: Successfully rendered live Kerala district feed, verified expert cards, and profile views."
        ])
    ]

    tc_w = Inches(8.8)
    tc_h = Inches(1.1)
    tc_top = Inches(1.35)

    for (tc_title, tc_badge, tc_col, tc_bullets) in test_cards:
        add_card(s19, Inches(0.6), tc_top, tc_w, tc_h, bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)

        bar = s19.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), tc_top, Inches(0.08), tc_h)
        bar.fill.solid()
        bar.fill.fore_color.rgb = tc_col
        bar.line.fill.background()

        ttx = s19.shapes.add_textbox(Inches(0.85), tc_top + Inches(0.06), tc_w - Inches(0.35), tc_h - Inches(0.12))
        ttf = ttx.text_frame
        ttf.word_wrap = True
        ttf.margin_left = ttf.margin_right = ttf.margin_top = ttf.margin_bottom = 0

        tp1 = ttf.paragraphs[0]
        tp1.text = f"{tc_title}   —   {tc_badge}"
        tp1.font.name = FONT_TITLE
        tp1.font.size = Pt(11.5)
        tp1.font.bold = True
        tp1.font.color.rgb = tc_col

        for b in tc_bullets:
            p = ttf.add_paragraph()
            p.text = b
            p.font.name = FONT_BODY
            p.font.size = Pt(8.8)
            p.font.color.rgb = COLOR_TEXT_MUTED
            p.space_before = Pt(1.5)

        tc_top += Inches(1.22)

    set_notes(s19,
        "Verification is evidence-based, not assumed. "
        "We executed 115 database integration tests with 100% pass rates, verifying atomic slot reservations and financial refund rules. "
        "Browser E2E tests verified key hardening, and we successfully installed and verified the native build on a physical Android 16 device.")

    # =========================================================================
    # SLIDE 20: CONCLUSION & FUTURE SCOPE
    # =========================================================================
    s20 = prs.slides.add_slide(blank_layout)
    set_slide_background(s20)
    add_header(s20, "Project Summary & Future Horizons", "Conclusion & Next Steps")
    add_footer(s20, 20)

    # Left: Future Scope
    add_card(s20, Inches(0.6), Inches(1.3), Inches(4.3), Inches(3.6), bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER)
    tx_f = s20.shapes.add_textbox(Inches(0.8), Inches(1.45), Inches(3.9), Inches(3.3))
    tff = tx_f.text_frame
    tff.word_wrap = True
    tff.margin_left = tff.margin_right = tff.margin_top = tff.margin_bottom = 0

    p_fh = tff.paragraphs[0]
    p_fh.text = "Planned Future Enhancements"
    p_fh.font.name = FONT_TITLE
    p_fh.font.size = Pt(13)
    p_fh.font.bold = True
    p_fh.font.color.rgb = COLOR_ACCENT_BLUE

    future_pts = [
        ("Computer Vision Model Integration", "Deploy on-device TensorFlow Lite models for offline leaf disease classification."),
        ("Multilingual Vernacular Support", "Voice-assisted query input and audio playback in Malayalam for older farmers."),
        ("IoT Telematics Integration", "Connect soil moisture and NPK telemetry sensors for proactive irrigation scheduling."),
        ("Payment Gateway Onboarding", "Integrate live Razorpay/UPI gateway to transition demo escrow into commercial production.")
    ]

    for h, b in future_pts:
        p1 = tff.add_paragraph()
        p1.text = f"• {h}"
        p1.font.name = FONT_TITLE
        p1.font.size = Pt(10)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_MAIN
        p1.space_before = Pt(6)

        p2 = tff.add_paragraph()
        p2.text = b
        p2.font.name = FONT_BODY
        p2.font.size = Pt(8.8)
        p2.font.color.rgb = COLOR_TEXT_MUTED
        p2.space_before = Pt(1)

    # Right: Conclusion & Thank you
    add_card(s20, Inches(5.1), Inches(1.3), Inches(4.3), Inches(3.6), bg_color=RGBColor(16, 26, 38), border_color=COLOR_ACCENT_GREEN)
    tx_th = s20.shapes.add_textbox(Inches(5.3), Inches(1.6), Inches(3.9), Inches(3.0))
    tfth = tx_th.text_frame
    tfth.word_wrap = True
    tfth.margin_left = tfth.margin_right = tfth.margin_top = tfth.margin_bottom = 0

    pth1 = tfth.paragraphs[0]
    pth1.text = "Thank You!"
    pth1.font.name = FONT_TITLE
    pth1.font.size = Pt(28)
    pth1.font.bold = True
    pth1.font.color.rgb = COLOR_ACCENT_GREEN
    pth1.alignment = PP_ALIGN.CENTER

    pth2 = tfth.add_paragraph()
    pth2.text = "AgroConnect demonstrates how modern cloud platforms, regional localization, and AI assistance can modernize rural agriculture."
    pth2.font.name = FONT_BODY
    pth2.font.size = Pt(10)
    pth2.font.color.rgb = COLOR_TEXT_MAIN
    pth2.alignment = PP_ALIGN.CENTER
    pth2.space_before = Pt(12)

    pth3 = tfth.add_paragraph()
    pth3.text = "Prince Abraham Shaji"
    pth3.font.name = FONT_TITLE
    pth3.font.size = Pt(14)
    pth3.font.bold = True
    pth3.font.color.rgb = COLOR_TEXT_MAIN
    pth3.alignment = PP_ALIGN.CENTER
    pth3.space_before = Pt(16)

    pth4 = tfth.add_paragraph()
    pth4.text = "Reg. No: AJC25MCA-2051\nAmal Jyothi College of Engineering\nQuestions & Discussion"
    pth4.font.name = FONT_BODY
    pth4.font.size = Pt(9.5)
    pth4.font.color.rgb = COLOR_TEXT_DIM
    pth4.alignment = PP_ALIGN.CENTER
    pth4.space_before = Pt(2)

    set_notes(s20,
        "In conclusion, AgroConnect delivers a cohesive, verified digital platform connecting farmers with certified agronomists and AI insights. "
        "Future enhancements will introduce computer vision on-device leaf scanning and Malayalam voice queries. "
        "Thank you to the panel and my guide Ms. Sona Maria Sebastian. I now invite your questions and feedback.")

    # Save presentation
    prs.save(PPTX_PATH)
    print(f"Presentation saved successfully to {PPTX_PATH}")
    print(f"Total slides: {len(prs.slides)}")

if __name__ == "__main__":
    create_presentation()

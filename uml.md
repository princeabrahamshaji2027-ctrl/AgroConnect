You are a Senior Software Architect, System Analyst, UML Expert, Database Architect, and Reverse Engineering Specialist.

Your task is to perform a COMPLETE reverse engineering analysis of my entire project.

DO NOT summarize.
DO NOT skip any files.
DO NOT make assumptions.
Analyze every file, folder, function, class, component, API, database table, service, model, controller, utility, frontend page, backend logic, middleware, configuration file, routing file, authentication system, state management, and business logic.

Think exactly like a software architect preparing documentation for an enterprise software system.

====================================================
STEP 1 – COMPLETE PROJECT ANALYSIS
====================================================

Scan the entire project recursively.

Identify:

• Folder Structure
• File Structure
• Programming Languages Used
• Frameworks Used
• Libraries Used
• External APIs
• Third Party Services
• Authentication Method
• Authorization Method
• Database Technology
• ORM (if used)
• Environment Variables
• Build Tools
• Deployment Method

Explain the purpose of every major folder and every major file.

====================================================
STEP 2 – IDENTIFY ALL MODULES
====================================================

Break the project into logical modules.

Example

Authentication Module

User Management

Admin Panel

Dashboard

Inventory

Orders

Payments

Notifications

Reports

Settings

Analytics

Profile

Messaging

etc.

For every module explain

Purpose

Responsibilities

Inputs

Outputs

Dependencies

====================================================
STEP 3 – IDENTIFY ALL CLASSES
====================================================

Find every class in the project.

For each class provide

Class Name

Description

Parent Class

Child Classes

Interfaces Implemented

Attributes

Data Types

Visibility

Methods

Method Parameters

Return Types

Static Methods

Relationships

Dependency

Aggregation

Composition

Association

Inheritance

Realization

Also identify utility classes.

====================================================
STEP 4 – IDENTIFY ALL OBJECTS
====================================================

Determine important runtime objects.

For every object explain

Object Name

Created From Which Class

Purpose

Life Cycle

Interactions

State Changes

====================================================
STEP 5 – DATABASE ANALYSIS
====================================================

Extract every database table.

For each table provide

Table Name

Columns

Data Types

Primary Keys

Foreign Keys

Constraints

Indexes

Relationships

One to One

One to Many

Many to Many

Explain normalization level.

====================================================
STEP 6 – API ANALYSIS
====================================================

List every API.

Include

Endpoint

Method

Controller

Request Body

Validation

Authentication Required

Response

Errors

Database Tables Used

Business Logic

====================================================
STEP 7 – FRONTEND ANALYSIS
====================================================

For every page identify

Purpose

Components

Buttons

Forms

Navigation

Validation

API Calls

Data Displayed

State Variables

Dependencies

====================================================
STEP 8 – BUSINESS LOGIC
====================================================

Extract every workflow.

Example

Login

Registration

Password Reset

Create Order

Delete User

Update Product

Payment

Notification

Approval

Booking

etc.

Explain each workflow step by step.

====================================================
STEP 9 – USER ROLES
====================================================

Identify every actor.

Customer

Admin

Employee

Manager

Guest

System

Third Party Service

For each actor explain

Permissions

Responsibilities

Actions

Restrictions

====================================================
STEP 10 – STATE CHANGES
====================================================

Identify every object that changes state.

Example

Order

Pending

Confirmed

Preparing

Delivered

Cancelled

Explain every state transition.

====================================================
STEP 11 – INTERACTIONS
====================================================

Identify every interaction between

User

Frontend

Backend

Database

External APIs

Background Services

Authentication

Notification System

====================================================
STEP 12 – COMPONENT ANALYSIS
====================================================

Break the system into software components.

For every component explain

Purpose

Interfaces

Dependencies

Internal Classes

External Connections

====================================================
STEP 13 – DEPLOYMENT ANALYSIS
====================================================

Identify

Frontend

Backend

Database

Server

Cloud

Storage

Authentication Provider

External Services

Deployment Architecture

====================================================
STEP 14 – UML DIAGRAM PREPARATION
====================================================

Now prepare COMPLETE information required to generate the following UML diagrams.

Do NOT draw them yet.

Instead provide ALL entities, relationships, attributes, methods, actors, states, messages and dependencies required.

Prepare data separately for:

1. Class Diagram

Include

Every class

Attributes

Methods

Relationships

Multiplicity

Visibility

Inheritance

Aggregation

Composition

Association

Realization

Dependency

----------------------------------------------------

2. Object Diagram

List all runtime objects.

Show object values.

Show links.

----------------------------------------------------

3. Component Diagram

Identify

Components

Interfaces

Dependencies

Packages

Libraries

Database

Services

----------------------------------------------------

4. Deployment Diagram

Identify

Nodes

Servers

Devices

Database

Cloud

Connections

Protocols

----------------------------------------------------

5. Use Case Diagram

Identify

Every Actor

Every Use Case

Include Relationships

Extend Relationships

Generalization

System Boundary

----------------------------------------------------

6. Sequence Diagram

For every important feature generate

Participants

Messages

Return Messages

Conditions

Loops

Alternative Flows

Activation Bars

Lifelines

Fragments

----------------------------------------------------

7. Activity Diagram

Generate activities for

Login

Registration

CRUD

Dashboard

Payments

Reports

Every important workflow

Include

Decision Nodes

Merge Nodes

Fork

Join

Start

End

----------------------------------------------------

8. State Machine Diagram

Identify all objects having state.

For each object provide

Initial State

Final State

Transitions

Events

Conditions

Actions

====================================================
STEP 15 – MERMAID SUPPORT
====================================================

For every UML diagram also generate Mermaid syntax.

====================================================
STEP 16 – PLANTUML SUPPORT
====================================================

For every UML diagram generate PlantUML code.

====================================================
STEP 17 – DRAW.IO SUPPORT
====================================================

Generate Draw.io compatible XML or diagram structure whenever possible.

====================================================
STEP 18 – CONSISTENCY CHECK
====================================================

Before generating the UML information verify that

Every class exists.

Every method exists.

Every relationship is correct.

Every API matches the source code.

Every database table matches the models.

Every actor matches the application.

Every workflow is complete.

Never invent missing information.

If something cannot be determined from the source code, explicitly state

"Not found in source code."

Only use information that exists in the project.

Produce the output in well-structured sections so it can directly be used to create professional UML documentation.
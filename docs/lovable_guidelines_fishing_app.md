# Lovable Guidelines -- Fishing App

## Purpose

This document defines the standing product, design, architecture,
integration, and authentication guidelines for building Kyle's fishing
log and recommendation app in Lovable.

Lovable should treat this as the persistent operating guide for the
project. Future prompts may add features or clarify requirements, but
unless explicitly overridden, Lovable should continue following these
principles.

------------------------------------------------------------------------

## 1. Product Vision

Build a mobile-first fishing log and trip planning app that helps
recreational anglers record past fishing experiences and use those
records, along with external environmental data, to make better
decisions about future fishing trips.

The app should feel practical, outdoors-oriented, and fast to use in
real fishing situations.

Core product goals: - log fishing trips and catches quickly - recall
what worked in specific conditions - enrich logs with map, weather, and
water-flow data - provide AI-assisted recommendations - support
frictionless demo mode

------------------------------------------------------------------------

## 2. Target Users

-   recreational anglers
-   primarily men, ages 20--40
-   often outdoors, one-handed usage
-   need speed and clarity over complexity

------------------------------------------------------------------------

## 3. Design Intent

### Mobile-first

-   one-handed usability
-   large touch targets
-   minimal typing

### UX Principles

-   high contrast
-   simple flows
-   clear CTAs
-   avoid dense UI

### Tone

-   modern
-   rugged
-   clean
-   outdoors-oriented

------------------------------------------------------------------------

## 4. Core Product Scope

### Fishing Logs

-   date, time, location
-   map pin + coordinates
-   gear used
-   catches
-   notes
-   weather snapshot
-   water flow snapshot

### Retrieval

-   filter by location, date, species

### AI Guidance

-   future trip recommendations
-   pattern-based suggestions

------------------------------------------------------------------------

## 5. Architecture Intent

-   modular design
-   clean separation of concerns
-   external APIs for enrichment
-   store snapshots with trips

------------------------------------------------------------------------

## 6. Integrations

### Used to augment AI inputs or fishing logs

- Some data will be passed into AI (i.e. user provides location, AI calls Weather for area)
- Some data will be copied to fishing records (i.e. what was the high/low temps and hourly temps for that day) or what was the water flow that day

#### Maps

-   interactive pin selection

#### Weather

-   historical hourly temps
-   future weather conditions

#### Water Flow

-   closest gauge data available
-   gage data from 

### AI

-   recommendations from user data + context

------------------------------------------------------------------------

## 7. Authentication

### Primary

-   email-based login

### Demo Mode

-   no login required
-   clone demo dataset per session
-   isolate demo from base data

------------------------------------------------------------------------

## 8. Data Model

Entities: - User - DemoSession - FishingTrip - Catch - Gear - Location -
WeatherSnapshot - WaterFlowSnapshot

------------------------------------------------------------------------

## 9. Reliability

-   offline tolerance
-   graceful API failure handling

------------------------------------------------------------------------

## 10. Optimization Priorities

-   mobile usability
-   demoability
-   modular architecture
-   real-world practicality

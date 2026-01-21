import WidgetKit
import SwiftUI
import AppIntents

struct CountdownConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Countdown Widget Configuration"
    static var description = IntentDescription("Configure your countdown widget appearance")
    
    @Parameter(title: "Widget Tint", description: "Choose a tint color for your widget")
    var tintColor: CountdownWidgetTintColor?
}

enum CountdownWidgetTintColor: String, AppEnum {
    case blue
    case red
    case green
    case purple
    case orange
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget Tint Color"
    
    static var caseDisplayRepresentations: [CountdownWidgetTintColor: DisplayRepresentation] = [
        .blue: "Blue",
        .red: "Red",
        .green: "Green",
        .purple: "Purple",
        .orange: "Orange"
    ]
    
    var uiColor: UIColor {
        switch self {
        case .blue: return .systemBlue
        case .red: return .systemRed
        case .green: return .systemGreen
        case .purple: return .systemPurple
        case .orange: return .systemOrange
        }
    }
}

struct CountdownWidgetProvider: IntentTimelineProvider {
    typealias Intent = CountdownConfigurationIntent
    func placeholder(in context: Context) -> CountdownWidgetEntry {
        CountdownWidgetEntry(date: Date(), countdowns: [], configuration: CountdownConfigurationIntent())
    }
    
    func getSnapshot(for configuration: CountdownConfigurationIntent, in context: Context, completion: @escaping (CountdownWidgetEntry) -> ()) {
        let entry = loadCountdownEntry(configuration: configuration)
        completion(entry)
    }
    
    func getTimeline(for configuration: CountdownConfigurationIntent, in context: Context, completion: @escaping (Timeline<CountdownWidgetEntry>) -> ()) {
        let entry = loadCountdownEntry(configuration: configuration)
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func loadCountdownEntry(configuration: CountdownConfigurationIntent) -> CountdownWidgetEntry {
        let sharedDefaults = UserDefaults(suiteName: "group.com.encore.candleapp.widgets")
        var countdowns: [CountdownData] = []
        
        if let countdownsJSON = sharedDefaults?.string(forKey: "countdowns"),
           let data = countdownsJSON.data(using: .utf8) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let allCountdowns = (try? decoder.decode([CountdownData].self, from: data)) ?? []
            
            // Filter out expired countdowns (only show future events)
            let now = Date()
            let formatter = ISO8601DateFormatter()
            countdowns = allCountdowns.filter { countdown in
                if let targetDate = formatter.date(from: countdown.targetDate) {
                    return targetDate > now
                }
                return false
            }
        }
        
        return CountdownWidgetEntry(date: Date(), countdowns: countdowns, configuration: configuration)
    }
}

struct CountdownData: Codable {
    let id: String
    let title: String
    let targetDate: String
    let description: String?
}

struct CountdownWidgetEntry: TimelineEntry {
    let date: Date
    let countdowns: [CountdownData]
    let configuration: CountdownConfigurationIntent
}

struct CountdownWidgetEntryView: View {
    var entry: CountdownWidgetProvider.Entry
    @Environment(\.widgetFamily) var family
    
    var gradientColors: [Color] {
        if let tint = entry.configuration.tintColor {
            let baseColor = Color(uiColor: tint.uiColor)
            return [baseColor, baseColor.opacity(0.7)]
        }
        return [Color(hex: "FF6B6B"), Color(hex: "FFE66D")]
    }
    
    var body: some View {
        if let countdown = entry.countdowns.first {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: gradientColors),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                
                VStack(spacing: 8) {
                    Text(countdown.title)
                        .font(.headline)
                        .foregroundColor(.white)
                        .lineLimit(2)
                    
                    if let targetDate = ISO8601DateFormatter().date(from: countdown.targetDate) {
                        let components = Calendar.current.dateComponents([.day, .hour], from: Date(), to: targetDate)
                        
                        if let days = components.day {
                            Text("\(days)")
                                .font(.system(size: 48, weight: .bold))
                                .foregroundColor(.white)
                                .tint(.white)
                            Text(days == 1 ? "day" : "days")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.9))
                        }
                    }
                }
                .padding()
            }
            .widgetURL(URL(string: "candle://countdown")!)
        } else {
            ZStack {
                Color(hex: "FFF8F0")
                VStack {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 40))
                        .foregroundColor(Color(hex: "FF6B6B"))
                        .tint(Color(hex: "FF6B6B"))
                    Text("No Countdowns")
                        .font(.caption)
                        .foregroundColor(Color(hex: "7F8C8D"))
                }
            }
            .widgetURL(URL(string: "candle://countdown")!)
        }
    }
}

extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        scanner.currentIndex = hex.hasPrefix("#") ? hex.index(after: hex.startIndex) : hex.startIndex
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)
        
        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0
        
        self.init(red: r, green: g, blue: b)
    }
}

@main
struct CandleCountdownWidget: Widget {
    let kind: String = "CandleCountdownWidget"
    
    var body: some WidgetConfiguration {
        IntentConfiguration(kind: kind, intent: CountdownConfigurationIntent.self, provider: CountdownWidgetProvider()) { entry in
            CountdownWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Countdown")
        .description("See your next special date")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

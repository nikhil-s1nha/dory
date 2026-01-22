import WidgetKit
import SwiftUI
import AppIntents

struct DailyPhotoConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Daily Photo Widget Configuration"
    static var description = IntentDescription("Configure your daily photo widget appearance")
    
    @Parameter(title: "Widget Tint", description: "Choose a tint color for your widget")
    var tintColor: DailyPhotoWidgetTintColor?
}

enum DailyPhotoWidgetTintColor: String, AppEnum {
    case blue
    case red
    case green
    case purple
    case orange
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget Tint Color"
    
    static var caseDisplayRepresentations: [DailyPhotoWidgetTintColor: DisplayRepresentation] = [
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

struct DailyPhotoWidgetProvider: IntentTimelineProvider {
    typealias Intent = DailyPhotoConfigurationIntent
    func placeholder(in context: Context) -> DailyPhotoWidgetEntry {
        DailyPhotoWidgetEntry(date: Date(), photoURL: nil, promptText: nil, partnerName: nil, configuration: DailyPhotoConfigurationIntent())
    }
    
    func getSnapshot(for configuration: DailyPhotoConfigurationIntent, in context: Context, completion: @escaping (DailyPhotoWidgetEntry) -> ()) {
        let entry = loadPhotoEntry(configuration: configuration)
        completion(entry)
    }
    
    func getTimeline(for configuration: DailyPhotoConfigurationIntent, in context: Context, completion: @escaping (Timeline<DailyPhotoWidgetEntry>) -> ()) {
        let entry = loadPhotoEntry(configuration: configuration)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func loadPhotoEntry(configuration: DailyPhotoConfigurationIntent) -> DailyPhotoWidgetEntry {
        // ARCHIVED: App Groups removed for Personal Team compatibility
        // Using standard UserDefaults - widgets won't receive data from main app
        let standardDefaults = UserDefaults.standard
        let photoURL = standardDefaults.string(forKey: "partnerPhotoURL")
        let promptText = standardDefaults.string(forKey: "dailyPhotoPrompt")
        let partnerName = standardDefaults.string(forKey: "partnerName")
        
        return DailyPhotoWidgetEntry(
            date: Date(),
            photoURL: photoURL,
            promptText: promptText,
            partnerName: partnerName,
            configuration: configuration
        )
    }
}

struct DailyPhotoWidgetEntry: TimelineEntry {
    let date: Date
    let photoURL: String?
    let promptText: String?
    let partnerName: String?
    let configuration: DailyPhotoConfigurationIntent
}

struct DailyPhotoWidgetEntryView: View {
    var entry: DailyPhotoWidgetProvider.Entry
    @Environment(\.widgetFamily) var family
    
    var tintColor: Color {
        if let tint = entry.configuration.tintColor {
            return Color(uiColor: tint.uiColor)
        }
        return Color(hex: "4ECDC4")
    }
    
    var body: some View {
        ZStack {
            if let photoURL = entry.photoURL, let url = URL(string: photoURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure(_):
                        placeholderView
                    case .empty:
                        ProgressView()
                            .tint(tintColor)
                    @unknown default:
                        placeholderView
                    }
                }
                
                VStack {
                    Spacer()
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            if let partnerName = entry.partnerName {
                                Text(partnerName)
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.white)
                            }
                            if let promptText = entry.promptText {
                                Text(promptText)
                                    .font(.caption2)
                                    .foregroundColor(.white.opacity(0.9))
                                    .lineLimit(2)
                            }
                        }
                        Spacer()
                    }
                    .padding(8)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.clear, .black.opacity(0.7)]),
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }
            } else {
                placeholderView
            }
        }
        .widgetURL(URL(string: "candle://photos")!)
    }
    
    var placeholderView: some View {
        ZStack {
            Color(hex: "FFF8F0")
            VStack(spacing: 8) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 40))
                    .foregroundColor(tintColor)
                    .tint(tintColor)
                Text("No Photo Yet")
                    .font(.caption)
                    .foregroundColor(Color(hex: "7F8C8D"))
            }
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
struct CandleDailyPhotoWidget: Widget {
    let kind: String = "CandleDailyPhotoWidget"
    
    var body: some WidgetConfiguration {
        IntentConfiguration(kind: kind, intent: DailyPhotoConfigurationIntent.self, provider: DailyPhotoWidgetProvider()) { entry in
            DailyPhotoWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Daily Photo")
        .description("See your partner's latest photo")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

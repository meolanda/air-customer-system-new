import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Google Drive client
async function getGoogleDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
      private_key: process.env['GOOGLE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })

  return google.drive({ version: 'v3', auth })
}

// POST - Upload file to Google Drive
export async function POST(request: NextRequest) {
  try {
    const drive = await getGoogleDriveClient()
    const folderId = process.env['GOOGLE_DRIVE_FOLDER_ID']

    if (!folderId) {
      return NextResponse.json(
        { error: 'GOOGLE_DRIVE_FOLDER_ID not configured' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type (images only)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed.' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Convert File to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique filename
    const timestamp = Date.now()
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}_${originalName}`

    // Upload to Google Drive
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: file.type,
      },
      media: {
        mimeType: file.type,
        body: buffer,
      },
      fields: 'id, name, webViewLink',
    })

    const fileId = response.data.id

    // Make the file publicly accessible
    await drive.permissions.create({
      fileId: fileId!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    // Get the direct download link
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`

    return NextResponse.json({
      success: true,
      data: {
        id: fileId,
        name: response.data.name,
        webViewLink: response.data.webViewLink,
        directUrl,
        url: directUrl, // For backward compatibility
      },
    })
  } catch (error: unknown) {
    console.error('Error uploading to Google Drive:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to upload file', details: errorMessage },
      { status: 500 }
    )
  }
}

// DELETE - Delete file from Google Drive
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      )
    }

    const drive = await getGoogleDriveClient()

    await drive.files.delete({
      fileId,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting from Google Drive:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to delete file', details: errorMessage },
      { status: 500 }
    )
  }
}
